import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { memberHighlight, canEditGyulekezet, tartozasSzoveg, type FamilyPersonRef, type PersonDetail as PersonDetailType } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { IconTrash, IconCross, IconMapPin } from "../components/icons";
import { DateInput } from "../components/DateInput";
import { age as calcAge } from "../lib/age";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { AddBurialForm, useCemeteries } from "../components/AddBurialForm";

function RelativeGroup({ title, people }: { title: string; people: FamilyPersonRef[] }) {
  if (people.length === 0) return null;
  return (
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        {title}
      </h3>
      <div className="row">
        {people.map((p) => (
          <Link key={p.id} to={`/szemelyek/${p.id}`} className="btn btn-secondary btn-sm">
            {p.vezeteknev} {p.keresztnev}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Szülők/gyermekek megjelenítése - egyenes (közvetlen FamilyLink) kapcsolat, ezért törölhető is. */
function RelativeGroupEditable({
  title,
  people,
  canEdit,
  onDeleted,
}: {
  title: string;
  people: (FamilyPersonRef & { linkId: string })[];
  canEdit: boolean;
  onDeleted: () => void;
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        {title}
      </h3>
      <div className="stack">
        {people.map((p) => (
          <div key={p.id} className="row" style={{ alignItems: "center" }}>
            <Link to={`/szemelyek/${p.id}`} className="btn btn-secondary btn-sm">
              {p.vezeteknev} {p.keresztnev}
            </Link>
            {canEdit && <DeleteFamilyLinkButton linkId={p.linkId} onDone={onDeleted} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const tisztsegLabels: Record<string, string> = {
  PRESBITER: "Presbiter",
  POTPRESBITER: "Pótpresbiter",
  GONDNOK: "Gondnok",
  FOGONDNOK: "Főgondnok",
  NOSZOVETSEGI_TAG: "Nőszövetségi tag",
};

const csaladiAllapotLabels: Record<string, string> = {
  NOTLEN_HAJADON: "Nőtlen / hajadon",
  HAZAS: "Házas",
  OZVEGY: "Özvegy",
  ELVALT: "Elvált",
};

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function EditForm({ person, onSaved, onCancel }: { person: PersonDetailType; onSaved: () => void; onCancel: () => void }) {
  const [vezeteknev, setVezeteknev] = useState(person.vezeteknev);
  const [keresztnev, setKeresztnev] = useState(person.keresztnev);
  const [nem, setNem] = useState(person.nem);
  const [szuletesiDatum, setSzuletesiDatum] = useState(toDateInput(person.szuletesiDatum));
  const [szuletesiHely, setSzuletesiHely] = useState(person.szuletesiHely ?? "");
  const [vallas, setVallas] = useState(person.vallas ?? "");
  const [csaladiAllapot, setCsaladiAllapot] = useState(person.csaladiAllapot ?? "");
  const [megjegyzes, setMegjegyzes] = useState(person.megjegyzes ?? "");
  const [nyitoTartozas, setNyitoTartozas] = useState(String(Number(person.nyitoTartozas) || 0));

  const [keresztelesDatum, setKeresztelesDatum] = useState(toDateInput(person.baptism?.datuma));
  const [keresztelesHelye, setKeresztelesHelye] = useState(person.baptism?.helye ?? "");
  const [keresztelesLelkesz, setKeresztelesLelkesz] = useState(person.baptism?.lelkeszNeve ?? "");

  const [konfirmacioDatum, setKonfirmacioDatum] = useState(toDateInput(person.confirmation?.datuma));
  const [konfirmacioHelye, setKonfirmacioHelye] = useState(person.confirmation?.helye ?? "");
  const [konfirmacioLelkesz, setKonfirmacioLelkesz] = useState(person.confirmation?.lelkeszNeve ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/persons/${person.id}`, {
        vezeteknev,
        keresztnev,
        nem,
        szuletesiDatum: szuletesiDatum || null,
        szuletesiHely: szuletesiHely || null,
        vallas: vallas || null,
        csaladiAllapot: csaladiAllapot || null,
        megjegyzes: megjegyzes || null,
        nyitoTartozas: Number(nyitoTartozas) || 0,
        ...(keresztelesDatum
          ? { kereszteles: { datuma: keresztelesDatum, helye: keresztelesHelye || null, lelkeszNeve: keresztelesLelkesz || null } }
          : {}),
        ...(konfirmacioDatum
          ? { konfirmacio: { datuma: konfirmacioDatum, helye: konfirmacioHelye || null, lelkeszNeve: konfirmacioLelkesz || null } }
          : {}),
      });
      onSaved();
    } catch {
      setError("Nem sikerült menteni a módosításokat");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Adatok szerkesztése</h2>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Vezetéknév</label>
          <input required value={vezeteknev} onChange={(e) => setVezeteknev(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Keresztnév</label>
          <input required value={keresztnev} onChange={(e) => setKeresztnev(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Nem</label>
          <select value={nem} onChange={(e) => setNem(e.target.value as "FERFI" | "NO")}>
            <option value="FERFI">Férfi</option>
            <option value="NO">Nő</option>
          </select>
        </div>
        <div className="field">
          <label>Születési dátum</label>
          <DateInput value={szuletesiDatum} onChange={(e) => setSzuletesiDatum(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Születési hely</label>
          <input value={szuletesiHely} onChange={(e) => setSzuletesiHely(e.target.value)} />
        </div>
        <div className="field">
          <label>Vallás</label>
          <input value={vallas} onChange={(e) => setVallas(e.target.value)} />
        </div>
        <div className="field">
          <label>Családi állapot</label>
          <select value={csaladiAllapot} onChange={(e) => setCsaladiAllapot(e.target.value)}>
            <option value="">— nincs megadva —</option>
            {Object.entries(csaladiAllapotLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3 style={{ margin: "8px 0 0" }}>Keresztelés</h3>
      <div className="row">
        <div className="field">
          <label>Dátum</label>
          <DateInput value={keresztelesDatum} onChange={(e) => setKeresztelesDatum(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Helye</label>
          <input value={keresztelesHelye} onChange={(e) => setKeresztelesHelye(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Lelkész neve</label>
          <input value={keresztelesLelkesz} onChange={(e) => setKeresztelesLelkesz(e.target.value)} />
        </div>
      </div>

      <h3 style={{ margin: "8px 0 0" }}>Konfirmáció</h3>
      <div className="row">
        <div className="field">
          <label>Dátum</label>
          <DateInput value={konfirmacioDatum} onChange={(e) => setKonfirmacioDatum(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Helye</label>
          <input value={konfirmacioHelye} onChange={(e) => setKonfirmacioHelye(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Lelkész neve</label>
          <input value={konfirmacioLelkesz} onChange={(e) => setKonfirmacioLelkesz(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Megjegyzés</label>
        <textarea rows={3} value={megjegyzes} onChange={(e) => setMegjegyzes(e.target.value)} />
      </div>

      <div className="field" style={{ maxWidth: 260 }}>
        <label>Korábbi (nyitó) tartozás - lej</label>
        <input type="number" min="0" value={nyitoTartozas} onChange={(e) => setNyitoTartozas(e.target.value)} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="row">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Mégse
        </button>
      </div>
    </form>
  );
}

function AddPositionForm({ personId, onAdded }: { personId: string; onAdded: () => void }) {
  const [tisztseg, setTisztseg] = useState("PRESBITER");
  const [kezdete, setKezdete] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      await api.post("/api/positions", { personId, tisztseg, kezdete });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Tisztség</label>
        <select value={tisztseg} onChange={(e) => setTisztseg(e.target.value)}>
          {Object.entries(tisztsegLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Kezdete</label>
        <DateInput value={kezdete} onChange={(e) => setKezdete(e.target.value)} />
      </div>
      <button className="btn btn-secondary" type="button" disabled={saving} onClick={handleAdd}>
        Tisztség hozzáadása
      </button>
    </div>
  );
}

const TISZTSEG_CIKLUS_EV = 3;

function isPositionExpired(kezdete: string, vege: string | null): boolean {
  if (vege) return false;
  const expiry = new Date(kezdete);
  expiry.setFullYear(expiry.getFullYear() + TISZTSEG_CIKLUS_EV);
  return expiry <= new Date();
}

function EndPositionButton({ positionId, danger, onEnded }: { positionId: string; danger: boolean; onEnded: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleEnd() {
    setSaving(true);
    try {
      await api.put(`/api/positions/${positionId}/end`, {});
      onEnded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button className={danger ? "btn btn-danger btn-sm" : "btn btn-secondary btn-sm"} disabled={saving} onClick={handleEnd}>
      Lezárás
    </button>
  );
}

function AddMarriageForm({ personId, onAdded }: { personId: string; onAdded: () => void }) {
  const [kulso, setKulso] = useState(false);
  const [spouseQuery, setSpouseQuery] = useState("");
  const [spouseResults, setSpouseResults] = useState<{ id: string; vezeteknev: string; keresztnev: string }[]>([]);
  const [spouseId, setSpouseId] = useState<string | null>(null);
  const [kulsoNev, setKulsoNev] = useState("");
  const [kulsoVallas, setKulsoVallas] = useState("");
  const [datuma, setDatuma] = useState("");
  const [helye, setHelye] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function search(q: string) {
    setSpouseQuery(q);
    setSpouseId(null);
    if (q.length < 2) {
      setSpouseResults([]);
      return;
    }
    const results = await api.get<{ id: string; vezeteknev: string; keresztnev: string }[]>(
      `/api/persons?q=${encodeURIComponent(q)}`
    );
    setSpouseResults(results.filter((r) => r.id !== personId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kulso && !spouseId) {
      setError("Válasszon egy személyt a listából, vagy jelölje meg, hogy külső (nem gyülekezeti tag) házastárs");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/marriages", {
        spouseAId: personId,
        kulso,
        spouseBId: kulso ? null : spouseId,
        kulsoHazastarsNeve: kulso ? kulsoNev || null : null,
        kulsoHazastarsVallasa: kulso ? kulsoVallas || null : null,
        datuma: datuma || null,
        helye: helye || null,
      });
      onAdded();
    } catch {
      setError("Nem sikerült rögzíteni a házasságot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={kulso} onChange={(e) => setKulso(e.target.checked)} />
        A házastárs nem gyülekezeti tag (nincs a rendszerben)
      </label>
      {kulso ? (
        <div className="row">
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Külső házastárs neve (ha ismert)</label>
            <input value={kulsoNev} onChange={(e) => setKulsoNev(e.target.value)} placeholder="Teljes név (opcionális)" />
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Vallása</label>
            <input value={kulsoVallas} onChange={(e) => setKulsoVallas(e.target.value)} placeholder="pl. református / ortodox" />
          </div>
        </div>
      ) : (
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Házastárs keresése (név)</label>
          <input value={spouseQuery} onChange={(e) => search(e.target.value)} placeholder="pl. Kovács Mária" />
          {spouseResults.length > 0 && !spouseId && (
            <div className="card" style={{ padding: 8, marginTop: 4 }}>
              {spouseResults.map((r) => (
                <div
                  key={r.id}
                  style={{ padding: 6, cursor: "pointer" }}
                  onClick={() => {
                    setSpouseId(r.id);
                    setSpouseQuery(`${r.vezeteknev} ${r.keresztnev}`);
                    setSpouseResults([]);
                  }}
                >
                  {r.vezeteknev} {r.keresztnev}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="row">
        <div className="field">
          <label>Esketés dátuma</label>
          <DateInput value={datuma} onChange={(e) => setDatuma(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Helye</label>
          <input value={helye} onChange={(e) => setHelye(e.target.value)} />
        </div>
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn btn-secondary" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
        Házasság rögzítése
      </button>
    </form>
  );
}

function AddChildForm({ personId, gyulekezetId, onAdded }: { personId: string; gyulekezetId: string; onAdded: () => void }) {
  const [uj, setUj] = useState(false);
  const [childQuery, setChildQuery] = useState("");
  const [childResults, setChildResults] = useState<{ id: string; vezeteknev: string; keresztnev: string }[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [vezeteknev, setVezeteknev] = useState("");
  const [keresztnev, setKeresztnev] = useState("");
  const [nem, setNem] = useState("FERFI");
  const [szuletesiDatum, setSzuletesiDatum] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function search(q: string) {
    setChildQuery(q);
    setChildId(null);
    if (q.length < 2) {
      setChildResults([]);
      return;
    }
    const results = await api.get<{ id: string; vezeteknev: string; keresztnev: string }[]>(
      `/api/persons?q=${encodeURIComponent(q)}`
    );
    setChildResults(results.filter((r) => r.id !== personId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!uj && !childId) {
      setError("Válasszon egy személyt a listából, vagy jelölje meg, hogy még nincs a rendszerben");
      return;
    }
    if (uj && (!vezeteknev.trim() || !keresztnev.trim())) {
      setError("A gyermek vezeték- és keresztneve kötelező");
      return;
    }
    setSaving(true);
    try {
      let resolvedChildId = childId;
      if (uj) {
        const created = await api.post<{ id: string }>("/api/persons", {
          vezeteknev,
          keresztnev,
          nem,
          szuletesiDatum: szuletesiDatum || null,
          gyulekezetId,
        });
        resolvedChildId = created.id;
      }
      await api.post("/api/family-links", { parentId: personId, childId: resolvedChildId });
      onAdded();
    } catch {
      setError("Nem sikerült rögzíteni a gyermeket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={uj} onChange={(e) => setUj(e.target.checked)} />
        A gyermek még nincs a rendszerben (új személy létrehozása)
      </label>
      {uj ? (
        <div className="row">
          <div className="field">
            <label>Vezetéknév</label>
            <input value={vezeteknev} onChange={(e) => setVezeteknev(e.target.value)} required />
          </div>
          <div className="field">
            <label>Keresztnév</label>
            <input value={keresztnev} onChange={(e) => setKeresztnev(e.target.value)} required />
          </div>
          <div className="field">
            <label>Neme</label>
            <select value={nem} onChange={(e) => setNem(e.target.value)}>
              <option value="FERFI">Férfi</option>
              <option value="NO">Nő</option>
            </select>
          </div>
          <div className="field">
            <label>Születési dátum</label>
            <DateInput value={szuletesiDatum} onChange={(e) => setSzuletesiDatum(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Gyermek keresése (név)</label>
          <input value={childQuery} onChange={(e) => search(e.target.value)} placeholder="pl. Kovács Mária" />
          {childResults.length > 0 && !childId && (
            <div className="card" style={{ padding: 8, marginTop: 4 }}>
              {childResults.map((r) => (
                <div
                  key={r.id}
                  style={{ padding: 6, cursor: "pointer" }}
                  onClick={() => {
                    setChildId(r.id);
                    setChildQuery(`${r.vezeteknev} ${r.keresztnev}`);
                    setChildResults([]);
                  }}
                >
                  {r.vezeteknev} {r.keresztnev}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn btn-secondary" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
        Gyermek rögzítése
      </button>
    </form>
  );
}

function AddParentForm({ personId, gyulekezetId, onAdded }: { personId: string; gyulekezetId: string; onAdded: () => void }) {
  const [uj, setUj] = useState(false);
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<{ id: string; vezeteknev: string; keresztnev: string }[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [vezeteknev, setVezeteknev] = useState("");
  const [keresztnev, setKeresztnev] = useState("");
  const [nem, setNem] = useState("FERFI");
  const [szuletesiDatum, setSzuletesiDatum] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function search(q: string) {
    setParentQuery(q);
    setParentId(null);
    if (q.length < 2) {
      setParentResults([]);
      return;
    }
    const results = await api.get<{ id: string; vezeteknev: string; keresztnev: string }[]>(
      `/api/persons?q=${encodeURIComponent(q)}`
    );
    setParentResults(results.filter((r) => r.id !== personId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!uj && !parentId) {
      setError("Válasszon egy személyt a listából, vagy jelölje meg, hogy még nincs a rendszerben");
      return;
    }
    if (uj && (!vezeteknev.trim() || !keresztnev.trim())) {
      setError("A szülő vezeték- és keresztneve kötelező");
      return;
    }
    setSaving(true);
    try {
      let resolvedParentId = parentId;
      if (uj) {
        const created = await api.post<{ id: string }>("/api/persons", {
          vezeteknev,
          keresztnev,
          nem,
          szuletesiDatum: szuletesiDatum || null,
          gyulekezetId,
        });
        resolvedParentId = created.id;
      }
      await api.post("/api/family-links", { parentId: resolvedParentId, childId: personId });
      onAdded();
    } catch {
      setError("Nem sikerült rögzíteni a szülőt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={uj} onChange={(e) => setUj(e.target.checked)} />
        A szülő még nincs a rendszerben (új személy létrehozása)
      </label>
      {uj ? (
        <div className="row">
          <div className="field">
            <label>Vezetéknév</label>
            <input value={vezeteknev} onChange={(e) => setVezeteknev(e.target.value)} required />
          </div>
          <div className="field">
            <label>Keresztnév</label>
            <input value={keresztnev} onChange={(e) => setKeresztnev(e.target.value)} required />
          </div>
          <div className="field">
            <label>Neme</label>
            <select value={nem} onChange={(e) => setNem(e.target.value)}>
              <option value="FERFI">Férfi</option>
              <option value="NO">Nő</option>
            </select>
          </div>
          <div className="field">
            <label>Születési dátum</label>
            <DateInput value={szuletesiDatum} onChange={(e) => setSzuletesiDatum(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Szülő keresése (név)</label>
          <input value={parentQuery} onChange={(e) => search(e.target.value)} placeholder="pl. Kovács Mária" />
          {parentResults.length > 0 && !parentId && (
            <div className="card" style={{ padding: 8, marginTop: 4 }}>
              {parentResults.map((r) => (
                <div
                  key={r.id}
                  style={{ padding: 6, cursor: "pointer" }}
                  onClick={() => {
                    setParentId(r.id);
                    setParentQuery(`${r.vezeteknev} ${r.keresztnev}`);
                    setParentResults([]);
                  }}
                >
                  {r.vezeteknev} {r.keresztnev}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn btn-secondary" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
        Szülő rögzítése
      </button>
    </form>
  );
}

function MoveToCemeteryCard({ personId, gyulekezetId, onDone }: { personId: string; gyulekezetId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const cemeteries = useCemeteries(gyulekezetId);

  if (!open) {
    return (
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="row" style={{ alignItems: "center", gap: 14 }}>
          <span className="icon-tile icon-tile--graphite">
            <IconCross style={{ width: 22, height: 22 }} />
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>Ha a személy elhunyt, itt helyezhető át a temetőbe.</span>
        </span>
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          Áthelyezés a temetőbe
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
        A mentés elhunytként rögzíti a személyt, és automatikusan özvegyre állítja a házastárs családi állapotát, ha van.
      </p>
      <AddBurialForm
        personId={personId}
        gyulekezetId={gyulekezetId}
        cemeteries={cemeteries}
        onDone={onDone}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

function RestoreFromCemeteryButton({ personId, burialId, onDone }: { personId: string; burialId: string | null; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setSaving(true);
    setError(null);
    try {
      if (burialId) {
        await api.delete(`/api/temeto/burials/${burialId}`);
      }
      await api.put(`/api/persons/${personId}`, { elhunyt: false, elhunytDatuma: null });
      onDone();
    } catch {
      setError("Nem sikerült visszaállítani");
      setSaving(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
        Visszaállítás (tévedésből lett elhunytként jelölve)
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>
          {burialId
            ? "Ez törli a rögzített temetést is, és a személyt újra élőként jelöli."
            : "A személy újra élőként lesz jelölve."}
        </span>
        <button className="btn btn-danger btn-sm" disabled={saving} onClick={handleRestore}>
          {saving ? "Visszaállítás..." : "Igen, visszaállítom"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
          Mégse
        </button>
      </div>
      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        Megjegyzés: a házastárs özvegy státuszát és a lezárt házasságot ez nem állítja vissza automatikusan - azt
        szükség esetén a Család résznél kell rendezni.
      </span>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
    </div>
  );
}

function EndMarriageButton({ marriageId, onDone }: { marriageId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function end(vegeOka: "VALAS" | "HALALOZAS") {
    setSaving(true);
    try {
      await api.put(`/api/marriages/${marriageId}/end`, { vegeOka });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Házasság lezárása
      </button>
    );
  }

  return (
    <div className="row">
      <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => end("VALAS")}>
        Válás
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
        Mégse
      </button>
    </div>
  );
}

/** Egy tévesen rögzített házasság-bejegyzés végleges eltávolítása - szándékosan külön a
 * lezárástól (ami egy megtörtént eseményt, válást/elhalálozást jelöl). */
function DeleteMarriageButton({ marriageId, onDone }: { marriageId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/marriages/${marriageId}`);
      onDone();
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn-icon btn-icon-danger" title="Bejegyzés törlése" onClick={() => setConfirming(true)}>
        <IconTrash style={{ width: 16, height: 16 }} />
      </button>
    );
  }

  return (
    <span className="row" style={{ alignItems: "center" }}>
      <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>Biztosan törli a bejegyzést?</span>
      <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
        {deleting ? "Törlés..." : "Igen, törlöm"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
        Mégse
      </button>
    </span>
  );
}

function DeleteFamilyLinkButton({ linkId, onDone }: { linkId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/family-links/${linkId}`);
      onDone();
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn-icon btn-icon-danger" title="Rokoni kapcsolat törlése" onClick={() => setConfirming(true)}>
        <IconTrash style={{ width: 16, height: 16 }} />
      </button>
    );
  }

  return (
    <span className="row" style={{ alignItems: "center" }}>
      <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>Biztosan törli a kapcsolatot?</span>
      <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
        {deleting ? "Törlés..." : "Igen, törlöm"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
        Mégse
      </button>
    </span>
  );
}

function PayOffOpeningDebtButton({ personId, osszeg, onDone }: { personId: string; osszeg: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fizetettOsszeg, setFizetettOsszeg] = useState(String(osszeg));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    const paid = Number(fizetettOsszeg);
    if (!paid || paid <= 0) {
      setError("Adjon meg egy pozitív összeget");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const remaining = Math.max(0, osszeg - paid);
      await api.put(`/api/persons/${personId}`, { nyitoTartozas: remaining });
      onDone();
    } catch {
      setError("Nem sikerült rögzíteni a kifizetést");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Tartozás kifizetése
      </button>
    );
  }

  return (
    <div className="row" style={{ alignItems: "center", gap: 8 }}>
      <input
        type="number"
        min="0"
        max={osszeg}
        style={{ width: 110 }}
        value={fizetettOsszeg}
        onChange={(e) => setFizetettOsszeg(e.target.value)}
      />
      <span style={{ fontWeight: 400 }}>lej befizetve</span>
      <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handlePay}>
        {saving ? "Rögzítés..." : "Rögzítés"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
        Mégse
      </button>
      {error && <span style={{ fontWeight: 400 }}>{error}</span>}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("hu-HU") + " " + d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function EditablePaymentRow({
  id,
  ev,
  osszeg,
  extra,
  kind,
  createdAt,
  updatedAt,
  onChanged,
  canEdit,
}: {
  id: string;
  ev: number;
  osszeg: string;
  extra?: string | null;
  kind: "dues" | "donation";
  createdAt: string;
  updatedAt: string;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [evVal, setEvVal] = useState(String(ev));
  const [osszegVal, setOsszegVal] = useState(osszeg);
  const [saving, setSaving] = useState(false);
  const base = kind === "dues" ? "/api/dues-payments" : "/api/donations";

  async function save() {
    setSaving(true);
    try {
      await api.put(`${base}/${id}`, { ev: Number(evVal), osszeg: Number(osszegVal) });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await api.delete(`${base}/${id}`);
    onChanged();
  }

  if (editing) {
    return (
      <div className="row" style={{ justifyContent: "space-between" }}>
        <input type="number" style={{ width: 100 }} value={evVal} onChange={(e) => setEvVal(e.target.value)} />
        <input type="number" style={{ width: 130 }} value={osszegVal} onChange={(e) => setOsszegVal(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={save}>
          Mentés
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Mégse
        </button>
      </div>
    );
  }

  const edited = new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60000;

  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <span>
        {ev}
        {extra ? ` — ${extra}` : ""}
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Rögzítve: {formatTimestamp(createdAt)}
          {edited ? ` · módosítva: ${formatTimestamp(updatedAt)}` : ""}
        </div>
      </span>
      <div className="row" style={{ alignItems: "center" }}>
        <strong>{osszeg} lej</strong>
        {canEdit && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Szerkesztés
            </button>
            <button className="btn btn-secondary btn-sm" onClick={remove}>
              Törlés
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function QuickPaymentForm({
  personId,
  kind,
  defaultOsszeg,
  onAdded,
}: {
  personId: string;
  kind: "dues" | "donation";
  defaultOsszeg: number | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ev, setEv] = useState(String(new Date().getFullYear()));
  const [osszeg, setOsszeg] = useState(kind === "dues" && defaultOsszeg !== null ? String(defaultOsszeg) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!osszeg) return;
    setSaving(true);
    try {
      await api.post(kind === "dues" ? "/api/dues-payments" : "/api/donations", {
        personId,
        ev: Number(ev),
        osszeg: Number(osszeg),
      });
      setOsszeg("");
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>
        {kind === "dues" ? "Egyházfenntartó rögzítése" : "Adomány rögzítése"}
      </button>
    );
  }

  return (
    <div className="row">
      <input type="number" placeholder="Év" style={{ width: 100 }} value={ev} onChange={(e) => setEv(e.target.value)} />
      <input
        type="number"
        placeholder="Összeg (lej)"
        style={{ width: 140 }}
        value={osszeg}
        onChange={(e) => setOsszeg(e.target.value)}
      />
      <button className="btn" type="button" disabled={saving} onClick={handleSave}>
        Mentés
      </button>
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
        Mégse
      </button>
    </div>
  );
}

function fmtMoveDate(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join(".");
}

/** Ha a személy egy elfogadott, rendszeren belüli költözéssel került a jelenlegi gyülekezetébe,
 * itt jelenik meg, honnan és mikor - hogy ez az adat sose vesszen el a folyamat után sem. */
function MovingHistoryNotice({ person }: { person: PersonDetailType }) {
  const incoming = person.movingHistory.find(
    (m) => m.status === "ELFOGADVA" && m.forrasGyulekezet && m.celGyulekezet
  );
  if (!incoming) return null;
  return (
    <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
      Ide költözött: {incoming.forrasGyulekezet!.nev} gyülekezetből, {fmtMoveDate(incoming.elbiralva ?? incoming.kezdemenyezve)}.
    </p>
  );
}

function MoveAwayForm({
  person,
  onDone,
  onCancel,
}: {
  person: PersonDetailType;
  onDone: () => void;
  onCancel: () => void;
}) {
  const gyulekezetek = useGyulekezetek();
  const [celGyulekezetId, setCelGyulekezetId] = useState("");
  const [ujCim, setUjCim] = useState("");
  const [indoklas, setIndoklas] = useState("");
  const [kezdemenyezve, setKezdemenyezve] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const masikGyulekezetek = gyulekezetek.filter((g) => g.id !== person.gyulekezetId);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/moving-requests", {
        personId: person.id,
        celGyulekezetId: celGyulekezetId || null,
        ujCim: ujCim || null,
        indoklas: indoklas || null,
        kezdemenyezve,
      });
      setDone(
        celGyulekezetId
          ? "Rögzítve - az új gyülekezet lelkésze a rendszeren belül értesítést kap, és elfogadhatja/elutasíthatja."
          : "Rögzítve - a személy a papírkosárba került (nem véglegesen)."
      );
    } catch {
      setError("Nem sikerült rögzíteni a költözést");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>{done}</p>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-secondary btn-sm" to={`/szemelyek/${person.id}/igazolas`}>
            Átiratkozási igazolás letöltése (PDF)
          </Link>
          <button className="btn btn-secondary btn-sm" onClick={onDone}>
            Bezárás
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <strong>Elköltözés rögzítése</strong>
      <div className="field">
        <label>Új gyülekezet (ha ezt a rendszert használja)</label>
        <select value={celGyulekezetId} onChange={(e) => setCelGyulekezetId(e.target.value)}>
          <option value="">Nem ismert / nem ezt a rendszert használja</option>
          {masikGyulekezetek.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nev}
            </option>
          ))}
        </select>
      </div>
      {!celGyulekezetId && (
        <div className="field">
          <label>Új cím / cél (szövegesen, ha ismert)</label>
          <input value={ujCim} onChange={(e) => setUjCim(e.target.value)} placeholder="pl. Németország, vagy egy másik település" />
        </div>
      )}
      <div className="field">
        <label>Költözés/indulás dátuma</label>
        <input type="date" value={kezdemenyezve} onChange={(e) => setKezdemenyezve(e.target.value)} />
      </div>
      <div className="field">
        <label>Oka (megjegyzés)</label>
        <input value={indoklas} onChange={(e) => setIndoklas(e.target.value)} />
      </div>
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={saving} onClick={handleSave}>
          {saving ? "Mentés..." : "Elköltözés rögzítése"}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Mégse
        </button>
      </div>
    </div>
  );
}

export function PersonDetail() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PersonDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showMarriageForm, setShowMarriageForm] = useState(false);
  const [showChildForm, setShowChildForm] = useState(false);
  const [showParentForm, setShowParentForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [showBurialForm, setShowBurialForm] = useState(false);
  const cemeteries = useCemeteries(person?.gyulekezetId ?? "");

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await api.delete(`/api/persons/${id}`);
      navigate("/haztartasok");
    } finally {
      setDeleting(false);
    }
  }

  function load() {
    if (!id) return;
    api
      .get<PersonDetailType>(`/api/persons/${id}`)
      .then(setPerson)
      .catch(() => setError("Nem sikerült betölteni a személy adatait"));
  }

  useEffect(load, [id]);

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!person) return <p>Betöltés...</p>;

  const age = calcAge(person.szuletesiDatum);
  const personDuesColor = memberHighlight(person.egyhazfenntarto, person.tobbEveElmaradt);
  // Ha az idei díj már teljes egészében ki van fizetve, nincs mit jelezni - az "Idei esedékes összeg" sáv ilyenkor nem jelenik meg.
  const idenEsedekes = person.egyhazfenntarto.esedekesOsszeg ?? 0;
  const idenFizetve = person.duesPayments
    .filter((p) => p.ev === new Date().getFullYear())
    .reduce((sum, p) => sum + Number(p.osszeg), 0);
  const idenKifizetve = idenEsedekes > 0 && idenFizetve >= idenEsedekes;
  const nyitoTartozasOsszeg = Number(person.nyitoTartozas);
  const canEdit = canEditGyulekezet(user, person.gyulekezetId);
  const currentAddressMembership =
    person.householdMemberships.find((hm) => !hm.vege) ?? person.householdMemberships[0] ?? null;

  return (
    <div className="stack">
      <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => navigate(-1)}>
        &larr; Vissza
      </button>
      <div className="row">
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>
          {person.vezeteknev} {person.keresztnev}
          {person.fizetveIdenre && (
            <span
              title="Idén már fizetett"
              style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", fontWeight: 400, marginLeft: 8 }}
            >
              ✓ idén fizetett
            </span>
          )}
          {person.elhunyt && (
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger)", marginLeft: 12 }}>
              elhunyt
            </span>
          )}
          {person.tobbEveElmaradt && (
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger)", fontWeight: 700, marginLeft: 12 }}>
              ⚠ tartozás: {tartozasSzoveg(person.tartozasOsszeg, person.tartozasEvek)}
            </span>
          )}
        </h1>
      </div>

      {!editing && (
        <div className="card stack">
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Alapadatok</h2>
          {currentAddressMembership ? (
            <Link
              to={`/haztartasok/${currentAddressMembership.household.id}`}
              title="Ki lakik ezen a címen?"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-primary-light)",
                border: "1.5px solid var(--color-primary)",
                textDecoration: "none",
                color: "var(--color-text)",
              }}
            >
              <IconMapPin style={{ width: 22, height: 22, color: "var(--color-primary)", flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Lakcím</span>
                <strong style={{ fontSize: "var(--font-size-lg)" }}>
                  {currentAddressMembership.household.address.telepules}, {currentAddressMembership.household.address.utca}{" "}
                  {currentAddressMembership.household.address.hazszam}
                  {currentAddressMembership.household.address.emeletAjto ? `, ${currentAddressMembership.household.address.emeletAjto}` : ""}
                </strong>
              </span>
              <span style={{ marginLeft: "auto", color: "var(--color-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
                Ki lakik itt? →
              </span>
            </Link>
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>
              <strong>Lakcím:</strong> nincs háztartáshoz rendelve
            </div>
          )}
          <div className="row">
            <div>
              <strong>Nem:</strong> {person.nem === "FERFI" ? "Férfi" : "Nő"}
            </div>
            <div>
              <strong>Születési dátum:</strong>{" "}
              {person.szuletesiDatum ? new Date(person.szuletesiDatum).toLocaleDateString("hu-HU") : "—"}
            </div>
            {age !== null && (
              <div>
                <strong>Életkor:</strong> {age} év
              </div>
            )}
            <div>
              <strong>Születési hely:</strong> {person.szuletesiHely ?? "—"}
            </div>
            <div>
              <strong>Vallás:</strong> {person.vallas ?? "—"}
            </div>
            <div>
              <strong>Családi állapot:</strong>{" "}
              {person.csaladiAllapot ? csaladiAllapotLabels[person.csaladiAllapot] : "—"}
            </div>
          </div>
        </div>
      )}

      {!editing && (
          <div className="card stack">
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházfenntartó</h2>
            {!idenKifizetve && (
            <div
              className="row"
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius)",
                background: personDuesColor?.bg ?? "var(--color-bg)",
                color: personDuesColor?.fg ?? "inherit",
              }}
            >
              {!person.egyhazfenntarto.ismertDijszabas ? (
                <span>Nincs beállítva díjszabás ebben a gyülekezetben.</span>
              ) : person.egyhazfenntarto.korsav === null && person.egyhazfenntartoBecsult ? (
                <strong>
                  Idei esedékes összeg: {person.egyhazfenntarto.esedekesOsszeg} lej
                  <span style={{ fontWeight: 400 }}> — általános díjszabás (nincs születési dátum rögzítve)</span>
                </strong>
              ) : person.egyhazfenntarto.korsav === null ? (
                <span>Nincs beállítva díjszabás erre a korosztályra ebben a gyülekezetben.</span>
              ) : person.egyhazfenntarto.mentes ? (
                <strong>Mentesség ({person.egyhazfenntarto.korsav.korhatarTol}–{person.egyhazfenntarto.korsav.korhatarIg} év)</strong>
              ) : (
                <strong>
                  {person.egyhazfenntarto.kedvezmenyes ? "Kedvezményes " : ""}Idei esedékes összeg:{" "}
                  {person.egyhazfenntarto.esedekesOsszeg} lej ({person.egyhazfenntarto.korsav.korhatarTol}–
                  {person.egyhazfenntarto.korsav.korhatarIg} év sáv)
                </strong>
              )}
            </div>
            )}
            {nyitoTartozasOsszeg > 0 && (
              <div
                className="stack"
                style={{
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  background: "rgba(255, 69, 58, 0.16)",
                  color: "var(--color-danger)",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    <strong>Korábbi (nyitó) tartozás: {nyitoTartozasOsszeg} lej</strong>
                    <span style={{ fontWeight: 400 }}> — a rendszer bevezetése előttről áthozott hátralék</span>
                  </span>
                  {canEdit && <PayOffOpeningDebtButton personId={person.id} osszeg={nyitoTartozasOsszeg} onDone={load} />}
                </div>
              </div>
            )}
            {person.duesPayments.length === 0 && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs rögzített befizetés.</p>}
            {person.duesPayments.map((pay) => (
              <EditablePaymentRow
                key={pay.id}
                id={pay.id}
                ev={pay.ev}
                osszeg={pay.osszeg}
                kind="dues"
                createdAt={pay.createdAt}
                updatedAt={pay.updatedAt}
                onChanged={load}
                canEdit={canEdit}
              />
            ))}
            {canEdit && (
              <QuickPaymentForm
                personId={person.id}
                kind="dues"
                defaultOsszeg={person.egyhazfenntarto.esedekesOsszeg}
                onAdded={load}
              />
            )}
          </div>
      )}

      {!editing && (
        <div className="card stack">
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Adomány</h2>
          {person.donations.length === 0 && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs rögzített adomány.</p>}
          {person.donations.map((d) => (
            <EditablePaymentRow
              key={d.id}
              id={d.id}
              ev={d.ev}
              osszeg={d.osszeg}
              extra={d.celja}
              kind="donation"
              createdAt={d.createdAt}
              updatedAt={d.updatedAt}
              onChanged={load}
              canEdit={canEdit}
            />
          ))}
          {canEdit && <QuickPaymentForm personId={person.id} kind="donation" defaultOsszeg={null} onAdded={load} />}
        </div>
      )}


      <MovingHistoryNotice person={person} />

      {editing ? (
        <EditForm
          person={person}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : (
        <>
          {person.elhunyt ? (
            <div className="card stack">
              <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Temető</h2>
              <div>
                <strong>Elhalálozás dátuma:</strong>{" "}
                {person.elhunytDatuma ? new Date(person.elhunytDatuma).toLocaleDateString("hu-HU") : "nincs rögzítve"}
              </div>
              {person.burial ? (
                <>
                  <div>
                    <strong>Eltemetve:</strong> {new Date(person.burial.datuma).toLocaleDateString("hu-HU")} —{" "}
                    {person.burial.sirhely.parcella.cemetery.nev}, {person.burial.sirhely.parcella.jelzes}/{person.burial.sirhely.jelzes}
                  </div>
                  {person.burial.halottiAnyakonyviSzam && (
                    <div>
                      <strong>Halotti anyakönyvi szám:</strong> {person.burial.halottiAnyakonyviSzam}
                    </div>
                  )}
                </>
              ) : showBurialForm ? (
                <AddBurialForm
                  personId={person.id}
                  gyulekezetId={person.gyulekezetId}
                  cemeteries={cemeteries}
                  initialElhunytDatuma={person.elhunytDatuma}
                  onDone={() => {
                    setShowBurialForm(false);
                    load();
                  }}
                  onCancel={() => setShowBurialForm(false)}
                />
              ) : (
                <div className="row" style={{ alignItems: "center" }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Nincs rögzítve temetés.</span>
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowBurialForm(true)}>
                      Temetés rögzítése
                    </button>
                  )}
                </div>
              )}
              {canEdit && (
                <RestoreFromCemeteryButton personId={person.id} burialId={person.burial?.id ?? null} onDone={load} />
              )}
            </div>
          ) : (
            canEdit && <MoveToCemeteryCard personId={person.id} gyulekezetId={person.gyulekezetId} onDone={load} />
          )}

          <div className="card stack">
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Anyakönyvi adatok</h2>
            <div>
              <strong>Keresztelés:</strong>{" "}
              {person.baptism
                ? `${new Date(person.baptism.datuma).toLocaleDateString("hu-HU")}${person.baptism.helye ? ", " + person.baptism.helye : ""}`
                : "nincs rögzítve"}
            </div>
            <div>
              <strong>Konfirmáció:</strong>{" "}
              {person.confirmation
                ? `${new Date(person.confirmation.datuma).toLocaleDateString("hu-HU")}${person.confirmation.helye ? ", " + person.confirmation.helye : ""}`
                : "nincs rögzítve"}
            </div>
          </div>

          <div className="card stack">
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Család</h2>
            <RelativeGroupEditable title="Szülők" people={person.csalad.szulok} canEdit={canEdit} onDeleted={load} />
            <RelativeGroup title="Nagyszülők" people={person.csalad.nagyszulok} />
            {person.csalad.hazastarsak.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  Házastárs
                </h3>
                <div className="stack">
                  {person.csalad.hazastarsak.map((h, i) => (
                    <div key={i} className="row" style={{ alignItems: "center" }}>
                      {h.kulso || !h.id ? (
                        <span className="badge">
                          {h.vezeteknev} {h.keresztnev}
                        </span>
                      ) : (
                        <Link to={`/szemelyek/${h.id}`} className="btn btn-secondary btn-sm">
                          {h.vezeteknev} {h.keresztnev}
                        </Link>
                      )}
                      {h.vege && (
                        <span style={{ color: "var(--color-text-muted)" }}>
                          (lezárva: {new Date(h.vege).toLocaleDateString("hu-HU")})
                        </span>
                      )}
                      {canEdit && !h.vege && <EndMarriageButton marriageId={h.marriageId} onDone={load} />}
                      {canEdit && <DeleteMarriageButton marriageId={h.marriageId} onDone={load} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <RelativeGroup title="Testvérek" people={person.csalad.testverek} />
            <RelativeGroupEditable title="Gyermekek" people={person.csalad.gyermekek} canEdit={canEdit} onDeleted={load} />
            <RelativeGroup title="Unokák" people={person.csalad.unokak} />
            {Object.values(person.csalad).every((arr) => arr.length === 0) && (
              <p style={{ color: "var(--color-text-muted)" }}>Nincs rögzített rokoni kapcsolat.</p>
            )}
            {canEdit && !showMarriageForm && !showChildForm && !showParentForm && (
              <div className="row">
                <button className="btn btn-secondary" onClick={() => setShowMarriageForm(true)}>
                  Házasság hozzáadása
                </button>
                <button className="btn btn-secondary" onClick={() => setShowParentForm(true)}>
                  Szülő hozzáadása
                </button>
                <button className="btn btn-secondary" onClick={() => setShowChildForm(true)}>
                  Gyermek hozzáadása
                </button>
              </div>
            )}
            {canEdit && showMarriageForm && (
              <AddMarriageForm
                personId={person.id}
                onAdded={() => {
                  setShowMarriageForm(false);
                  load();
                }}
              />
            )}
            {canEdit && showParentForm && (
              <AddParentForm
                personId={person.id}
                gyulekezetId={person.gyulekezetId}
                onAdded={() => {
                  setShowParentForm(false);
                  load();
                }}
              />
            )}
            {canEdit && showChildForm && (
              <AddChildForm
                personId={person.id}
                gyulekezetId={person.gyulekezetId}
                onAdded={() => {
                  setShowChildForm(false);
                  load();
                }}
              />
            )}
          </div>

          <div className="card stack">
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Tisztségek</h2>
            <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
              Egy tisztség {TISZTSEG_CIKLUS_EV} év után lejár - ha addig nincs lezárva, a rendszer jelzi, hogy
              megújításra vagy lezárásra szorul.
            </p>
            {person.positions.map((pos) => {
              const expired = isPositionExpired(pos.kezdete, pos.vege);
              return (
                <div key={pos.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    {tisztsegLabels[pos.tisztseg] ?? pos.tisztseg}
                    {pos.vege
                      ? ` (${new Date(pos.kezdete).getFullYear()}–${new Date(pos.vege).getFullYear()})`
                      : ` (${new Date(pos.kezdete).getFullYear()}-tól)`}
                    {expired && (
                      <span style={{ color: "var(--color-danger)", fontWeight: 700 }}> · ⚠ lejárt, megújítás szükséges</span>
                    )}
                  </span>
                  {!pos.vege && canEdit && (
                    <EndPositionButton
                      positionId={pos.id}
                      danger={expired}
                      onEnded={load}
                    />
                  )}
                </div>
              );
            })}
            {canEdit && <AddPositionForm personId={person.id} onAdded={load} />}
          </div>


          {person.megjegyzes && (
            <div className="card stack">
              <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Megjegyzés</h2>
              <p style={{ margin: 0 }}>{person.megjegyzes}</p>
            </div>
          )}

        </>
      )}

      <div className="stack">
        {!editing && !confirmDelete && (
          <div className="row">
            <Link className="btn btn-secondary" to={`/szemelyek/${person.id}/igazolas`}>
              Igazolás kiállítása
            </Link>
            <Link className="btn btn-secondary" to={`/valtozas-tortenet?entity=Person&entityId=${person.id}`}>
              Változás-történet
            </Link>
            {canEdit && !person.elhunyt && (
              <button className="btn btn-secondary" onClick={() => setShowMoveForm(true)}>
                Elköltözés jelölése
              </button>
            )}
            {canEdit && (
              <>
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                  Szerkesztés
                </button>
                <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  Személy törlése
                </button>
              </>
            )}
          </div>
        )}
        {showMoveForm && (
          <MoveAwayForm person={person} onDone={() => { setShowMoveForm(false); load(); }} onCancel={() => setShowMoveForm(false)} />
        )}
        {confirmDelete && (
          <div className="row" style={{ alignItems: "center" }}>
            <span style={{ color: "var(--color-danger)" }}>
              Biztosan törli {person.vezeteknev} {person.keresztnev} adatait? A papírkosárba kerül, onnan
              bármikor visszaállítható.
            </span>
            <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Törlés..." : "Igen, törlöm"}
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Mégse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
