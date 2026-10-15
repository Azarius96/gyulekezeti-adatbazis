import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { DateInput } from "../components/DateInput";

interface Tovabbkepzes {
  id: string;
  megnevezes: string;
  kredit: number;
  datum: string;
  megjegyzes: string | null;
}

interface Lelkesz {
  id: string;
  nev: string;
  elnok: boolean;
  gyulekezetek: string[];
  osszKredit: number;
  tovabbkepzesek: Tovabbkepzes[];
}

interface Adat {
  szerkesztheto: boolean;
  lelkeszek: Lelkesz[];
}

const fmtDatum = (iso: string) => new Date(iso).toLocaleDateString("hu-HU");

/** Lelkészek továbbképzései: milyen képzésen vettek részt, hány kreditet kaptak érte és mikor. A rendszergazda és a
 * lelkészértekezleti elnök szerkeszthet, a többi lelkész csak a sajátját látja. */
export function Tovabbkepzesek() {
  const [adat, setAdat] = useState<Adat | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Adat>("/api/tovabbkepzesek")
      .then(setAdat)
      .catch(() => setError("Nem sikerült betölteni a továbbképzéseket"));
  }

  useEffect(load, []);

  return (
    <div className="stack">
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Lelkészek továbbképzése</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        {adat?.szerkesztheto
          ? "A lelkészek továbbképzései: milyen képzésen vettek részt, hány kreditet kaptak érte és mikor. Te rögzítheted és módosíthatod őket."
          : "A saját továbbképzéseid és kreditjeid. Módosításukat a lelkészértekezleti elnök végzi."}
      </p>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {adat && adat.lelkeszek.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nincs megjeleníthető lelkész.</p>}
      {adat?.lelkeszek.map((l) => (
        <LelkeszKartya key={l.id} lelkesz={l} szerkesztheto={adat.szerkesztheto} onChanged={load} />
      ))}
    </div>
  );
}

function LelkeszKartya({ lelkesz, szerkesztheto, onChanged }: { lelkesz: Lelkesz; szerkesztheto: boolean; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: "var(--font-size-lg)" }}>{lelkesz.nev}</strong>
          {lelkesz.elnok && (
            <span className="badge-sm" style={{ marginLeft: 10 }}>
              Lelkészértekezleti elnök
            </span>
          )}
          {lelkesz.gyulekezetek.length > 0 && (
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{lelkesz.gyulekezetek.join(", ")}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800, lineHeight: 1 }}>{lelkesz.osszKredit}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>kredit összesen</div>
        </div>
      </div>

      {lelkesz.tovabbkepzesek.length === 0 && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs rögzített továbbképzés.</p>}
      {lelkesz.tovabbkepzesek.map((t) => (
        <SorTovabbkepzes key={t.id} t={t} szerkesztheto={szerkesztheto} onChanged={onChanged} />
      ))}

      {szerkesztheto &&
        (adding ? (
          <TovabbkepzesForm
            userId={lelkesz.id}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>
            Továbbképzés rögzítése
          </button>
        ))}
    </div>
  );
}

function SorTovabbkepzes({ t, szerkesztheto, onChanged }: { t: Tovabbkepzes; szerkesztheto: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (editing) {
    return <TovabbkepzesForm existing={t} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;
  }

  async function remove() {
    await api.delete(`/api/tovabbkepzesek/${t.id}`);
    onChanged();
  }

  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <span>
        <strong>{t.megnevezes}</strong>
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          {fmtDatum(t.datum)}
          {t.megjegyzes ? ` · ${t.megjegyzes}` : ""}
        </div>
      </span>
      <div className="row" style={{ alignItems: "center" }}>
        <strong>{t.kredit} kredit</strong>
        {szerkesztheto &&
          (confirmDelete ? (
            <>
              <button className="btn btn-danger btn-sm" onClick={remove}>
                Igen, törlöm
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
                Mégse
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                Szerkesztés
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(true)}>
                Törlés
              </button>
            </>
          ))}
      </div>
    </div>
  );
}

function TovabbkepzesForm({
  userId,
  existing,
  onDone,
  onCancel,
}: {
  userId?: string;
  existing?: Tovabbkepzes;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [megnevezes, setMegnevezes] = useState(existing?.megnevezes ?? "");
  const [kredit, setKredit] = useState(existing ? String(existing.kredit) : "");
  const [datum, setDatum] = useState(existing ? existing.datum.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [megjegyzes, setMegjegyzes] = useState(existing?.megjegyzes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!megnevezes.trim() || kredit === "" || !datum) {
      setError("A megnevezés, a kredit és a dátum kitöltése kötelező");
      return;
    }
    setSaving(true);
    setError(null);
    const body = { megnevezes: megnevezes.trim(), kredit: Number(kredit), datum, megjegyzes: megjegyzes.trim() || null };
    try {
      if (existing) await api.put(`/api/tovabbkepzesek/${existing.id}`, body);
      else await api.post("/api/tovabbkepzesek", { ...body, userId });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült menteni");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}>
      <div className="row">
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>Milyen továbbképzés</label>
          <input value={megnevezes} onChange={(e) => setMegnevezes(e.target.value)} placeholder="pl. Pásztorképzés, konferencia, tanfolyam" />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Kredit</label>
          <input type="number" min="0" value={kredit} onChange={(e) => setKredit(e.target.value)} />
        </div>
        <div className="field" style={{ width: 160 }}>
          <label>Mikor kapta</label>
          <DateInput value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Megjegyzés (nem kötelező)</label>
        <input value={megjegyzes} onChange={(e) => setMegjegyzes(e.target.value)} />
      </div>
      {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</span>}
      <div className="row">
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Mégse
        </button>
      </div>
    </div>
  );
}
