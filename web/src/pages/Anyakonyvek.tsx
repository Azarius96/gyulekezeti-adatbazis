import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { IconDroplet, IconBook, IconRings, IconCross, IconMapPin, IconTrash } from "../components/icons";
import { ageOn as calcAge } from "../lib/age";
import { ApiError } from "../lib/api";

const CURRENT_YEAR = new Date().getFullYear();

type Tab = "osszesito" | "keresztelesek" | "konfirmaciok" | "hazassagok" | "temetesek" | "koltozesek";

const TABS: { id: Tab; label: string }[] = [
  { id: "osszesito", label: "Összesítő" },
  { id: "keresztelesek", label: "Keresztelések" },
  { id: "konfirmaciok", label: "Konfirmációk" },
  { id: "hazassagok", label: "Házasságkötések" },
  { id: "temetesek", label: "Temetések" },
  { id: "koltozesek", label: "Elköltözések" },
];

interface PersonRef {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  szuletesiDatum: string | null;
  gyulekezet: { nev: string };
}

/** Egy adott anyakönyvi lista (keresztelés/konfirmáció/házasság/temetés) betöltése évenként,
 * gyülekezet-szűréssel - a négy fül azonos adatlekérési mintáját fogja össze egy helyen. */
function useYearlyRegister<T>(endpoint: string, gyulekezetId: string) {
  const [ev, setEv] = useState(String(CURRENT_YEAR));
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("ev", ev);
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<T[]>(`${endpoint}?${params.toString()}`)
      .then(setItems)
      .catch(() => setError("Nem sikerült betölteni az anyakönyvet"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [gyulekezetId]);

  return { ev, setEv, items, loading, error, load };
}

function RegisterHeader({
  icon: Icon,
  title,
  count,
  ev,
  tone,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  count: number;
  ev: string;
  tone: string;
}) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <div className="row" style={{ alignItems: "center", gap: 14 }}>
        <div className={`icon-tile icon-tile--${tone}`}>
          <Icon style={{ width: 22, height: 22 }} />
        </div>
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>{title}</h2>
      </div>
      <span className="badge">{count === 0 ? `Nincs bejegyzés ${ev}-ban/-ben` : `${count} bejegyzés ${ev}-ban/-ben`}</span>
    </div>
  );
}

function YearPicker({ ev, setEv, onRefresh, loading }: { ev: string; setEv: (v: string) => void; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ width: 110, marginBottom: 0 }}>
        <label>Év</label>
        <input type="number" value={ev} onChange={(e) => setEv(e.target.value)} />
      </div>
      <button className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
        {loading ? "Betöltés..." : "Frissítés"}
      </button>
    </div>
  );
}

function PersonRow({
  nev,
  korInfo,
  eventLabel,
  meta,
  showGyulekezetNev,
  gyulekezetNev,
  personId,
}: {
  nev: string;
  korInfo: string | null;
  eventLabel: string;
  meta: string;
  showGyulekezetNev: boolean;
  gyulekezetNev: string;
  personId: string;
}) {
  const initials = nev
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="row"
      style={{ alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
          border: "1px solid var(--color-border)",
        }}
      >
        {initials}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <Link to={`/szemelyek/${personId}`} style={{ fontWeight: 700 }}>
          {nev}
        </Link>
        {korInfo && <span style={{ color: "var(--color-text-muted)" }}> ({korInfo})</span>}
        {showGyulekezetNev && <span style={{ color: "var(--color-text-muted)" }}> — {gyulekezetNev}</span>}
        <div className="row" style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
          <span className="badge-sm">{eventLabel}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{meta}</span>
        </div>
      </span>
    </div>
  );
}

export function Anyakonyvek() {
  const gyulekezetek = useGyulekezetek();
  const [gyulekezetId] = useSelectedGyulekezet();
  const [tab, setTab] = useState<Tab>("osszesito");
  const showGyulekezetNev = gyulekezetek.length > 1;

  return (
    <div className="stack">
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Anyakönyvek</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Keresztelési, konfirmációs, házassági és temetési anyakönyv évenkénti áttekintése.
      </p>

      <div className="row" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 4 }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "btn" : "btn btn-secondary"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "osszesito" && <Osszesito gyulekezetId={gyulekezetId} />}
      {tab === "keresztelesek" && <Keresztelesek gyulekezetId={gyulekezetId} showGyulekezetNev={showGyulekezetNev} />}
      {tab === "konfirmaciok" && <Konfirmaciok gyulekezetId={gyulekezetId} showGyulekezetNev={showGyulekezetNev} />}
      {tab === "hazassagok" && <Hazassagok gyulekezetId={gyulekezetId} showGyulekezetNev={showGyulekezetNev} />}
      {tab === "temetesek" && <Temetesek gyulekezetId={gyulekezetId} showGyulekezetNev={showGyulekezetNev} />}
      {tab === "koltozesek" && <Koltozesek gyulekezetId={gyulekezetId} showGyulekezetNev={showGyulekezetNev} />}
    </div>
  );
}

interface OsszesitoData {
  keresztelesek: number;
  konfirmaciok: number;
  hazassagok: number;
  temetesek: number;
}

function Osszesito({ gyulekezetId }: { gyulekezetId: string }) {
  const [ev, setEv] = useState(String(CURRENT_YEAR));
  const [data, setData] = useState<OsszesitoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("ev", ev);
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<OsszesitoData>(`/api/anyakonyv/osszesito?${params.toString()}`)
      .then(setData)
      .catch(() => setError("Nem sikerült betölteni az összesítőt"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [gyulekezetId]);

  return (
    <div className="stack">
      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Éves összesítő</h2>
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
          A presbitériumnak/közgyűlésnek benyújtandó évi jelentéshez - az adott évi anyakönyvi bejegyzések száma.
        </p>
        <YearPicker ev={ev} setEv={setEv} onRefresh={load} loading={loading} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {data && (
        <div className="card-grid">
          {[
            { label: "Keresztelés", value: data.keresztelesek, icon: IconDroplet, tone: "teal" },
            { label: "Konfirmáció", value: data.konfirmaciok, icon: IconBook, tone: "orange" },
            { label: "Házasságkötés", value: data.hazassagok, icon: IconRings, tone: "pink" },
            { label: "Temetés", value: data.temetesek, icon: IconCross, tone: "graphite" },
          ].map((s) => (
            <div key={s.label} className="card stack" style={{ alignItems: "center", textAlign: "center" }}>
              <div className={`icon-tile icon-tile--${s.tone}`}>
                <s.icon style={{ width: 22, height: 22 }} />
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{s.value}</div>
              <div style={{ color: "var(--color-text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface KeresztelesData {
  id: string;
  datuma: string;
  helye: string | null;
  lelkeszNeve: string | null;
  keresztszulok: string | null;
  person: PersonRef;
}

function Keresztelesek({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const { ev, setEv, items, loading, error, load } = useYearlyRegister<KeresztelesData>("/api/anyakonyv/keresztelesek", gyulekezetId);

  return (
    <div className="card stack">
      <RegisterHeader icon={IconDroplet} title="Keresztelési anyakönyv" count={items.length} ev={ev} tone="teal" />
      <YearPicker ev={ev} setEv={setEv} onRefresh={load} loading={loading} />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {items.map((k) => (
          <PersonRow
            key={k.id}
            personId={k.person.id}
            nev={`${k.person.vezeteknev} ${k.person.keresztnev}`}
            korInfo={null}
            gyulekezetNev={k.person.gyulekezet.nev}
            showGyulekezetNev={showGyulekezetNev}
            eventLabel={`keresztelés: ${k.datuma.slice(0, 10)}`}
            meta={`${k.helye ? k.helye : ""}${k.lelkeszNeve ? `${k.helye ? " · " : ""}lelkész: ${k.lelkeszNeve}` : ""}${k.keresztszulok ? ` · keresztszülők: ${k.keresztszulok}` : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

interface KonfirmaciaData {
  id: string;
  datuma: string;
  helye: string | null;
  lelkeszNeve: string | null;
  person: PersonRef;
}

function Konfirmaciok({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const { ev, setEv, items, loading, error, load } = useYearlyRegister<KonfirmaciaData>("/api/anyakonyv/konfirmaciok", gyulekezetId);

  return (
    <div className="card stack">
      <RegisterHeader icon={IconBook} title="Konfirmációs anyakönyv" count={items.length} ev={ev} tone="orange" />
      <YearPicker ev={ev} setEv={setEv} onRefresh={load} loading={loading} />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {items.map((k) => (
          <PersonRow
            key={k.id}
            personId={k.person.id}
            nev={`${k.person.vezeteknev} ${k.person.keresztnev}`}
            korInfo={calcAge(k.person.szuletesiDatum, k.datuma) !== null ? `${calcAge(k.person.szuletesiDatum, k.datuma)} év` : null}
            gyulekezetNev={k.person.gyulekezet.nev}
            showGyulekezetNev={showGyulekezetNev}
            eventLabel={`konfirmáció: ${k.datuma.slice(0, 10)}`}
            meta={`${k.helye ? k.helye : ""}${k.lelkeszNeve ? `${k.helye ? " · " : ""}lelkész: ${k.lelkeszNeve}` : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

interface HazassagData {
  id: string;
  datuma: string;
  helye: string | null;
  lelkeszNeve: string | null;
  vege: string | null;
  vegeOka: "HALALOZAS" | "VALAS" | null;
  kulsoHazastarsNeve: string | null;
  spouseA: PersonRef;
  spouseB: PersonRef | null;
}

function Hazassagok({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const { ev, setEv, items, loading, error, load } = useYearlyRegister<HazassagData>("/api/anyakonyv/hazassagok", gyulekezetId);

  return (
    <div className="card stack">
      <RegisterHeader icon={IconRings} title="Házassági anyakönyv" count={items.length} ev={ev} tone="pink" />
      <YearPicker ev={ev} setEv={setEv} onRefresh={load} loading={loading} />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {items.map((h) => {
          const masikFel = h.spouseB ? `${h.spouseB.vezeteknev} ${h.spouseB.keresztnev}` : h.kulsoHazastarsNeve ?? "ismeretlen";
          return (
            <PersonRow
              key={h.id}
              personId={h.spouseA.id}
              nev={`${h.spouseA.vezeteknev} ${h.spouseA.keresztnev} & ${masikFel}`}
              korInfo={null}
              gyulekezetNev={h.spouseA.gyulekezet.nev}
              showGyulekezetNev={showGyulekezetNev}
              eventLabel={`esküvő: ${h.datuma.slice(0, 10)}`}
              meta={`${h.helye ? h.helye : ""}${h.lelkeszNeve ? `${h.helye ? " · " : ""}lelkész: ${h.lelkeszNeve}` : ""}${
                h.vege ? ` · vége: ${h.vege.slice(0, 10)} (${h.vegeOka === "VALAS" ? "válás" : "özvegység"})` : ""
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

interface KoltozesData {
  id: string;
  regiCim: string;
  ujCim: string;
  indoklas: string | null;
  status: "FUGGOBEN" | "ELFOGADVA" | "ELUTASITVA" | "ISMERETLEN_CELBA";
  kezdemenyezve: string;
  person: { id: string; vezeteknev: string; keresztnev: string; gyulekezet: { nev: string } };
  celGyulekezet: { nev: string } | null;
}

const koltozesStatusLabel: Record<KoltozesData["status"], string> = {
  FUGGOBEN: "Függőben (célgyülekezet elbírálására vár)",
  ELFOGADVA: "Elfogadva",
  ELUTASITVA: "Elutasítva",
  ISMERETLEN_CELBA: "Ismeretlen/külső célba",
};

function Koltozesek({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const [items, setItems] = useState<KoltozesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<KoltozesData[]>(`/api/moving-requests?${params.toString()}`)
      .then(setItems)
      .catch(() => setError("Nem sikerült betölteni a költözéseket"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [gyulekezetId]);

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="icon-tile icon-tile--indigo">
            <IconMapPin style={{ width: 22, height: 22 }} />
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Elköltözések</h2>
        </div>
        <span className="badge">{items.length === 0 ? "Nincs bejegyzés" : `${items.length} bejegyzés összesen`}</span>
      </div>
      <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
        Új elköltözés rögzítése a személy saját adatlapjáról indítható ("Elköltözés jelölése" gomb).
      </p>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--color-text-muted)" }}>Betöltés...</p>}
      <div className="stack" style={{ gap: 10 }}>
        {items.map((k) => (
          <KoltozesRow key={k.id} item={k} showGyulekezetNev={showGyulekezetNev} onChanged={load} />
        ))}
        {!loading && items.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nincs rögzített elköltözés.</p>}
      </div>
    </div>
  );
}

function KoltozesRow({
  item,
  showGyulekezetNev,
  onChanged,
}: {
  item: KoltozesData;
  showGyulekezetNev: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ujCim, setUjCim] = useState(item.ujCim);
  const [indoklas, setIndoklas] = useState(item.indoklas ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/moving-requests/${item.id}`, { ujCim, indoklas: indoklas || null });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült menteni");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await api.delete(`/api/moving-requests/${item.id}`);
    onChanged();
  }

  const cel = item.celGyulekezet ? item.celGyulekezet.nev : item.ujCim;

  return (
    <div className="stack" style={{ gap: 6, padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/szemelyek/${item.person.id}`} style={{ fontWeight: 700 }}>
            {item.person.vezeteknev} {item.person.keresztnev}
          </Link>
          {showGyulekezetNev && <span style={{ color: "var(--color-text-muted)" }}> — {item.person.gyulekezet.nev}</span>}
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginTop: 4 }}>
            {item.regiCim || "ismeretlen cím"} → {cel} · {item.kezdemenyezve.slice(0, 10)}
            {item.indoklas ? ` · ${item.indoklas}` : ""}
          </div>
          <span className="badge-sm" style={{ marginTop: 6, display: "inline-block" }}>
            {koltozesStatusLabel[item.status]}
          </span>
        </span>
        {!editing && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Szerkesztés
            </button>
            {!confirmDelete ? (
              <button className="btn-icon btn-icon-danger" title="Törlés" onClick={() => setConfirmDelete(true)}>
                <IconTrash style={{ width: 14, height: 14 }} />
              </button>
            ) : (
              <>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                  Igen, törlöm
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
                  Mégse
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <input value={ujCim} onChange={(e) => setUjCim(e.target.value)} placeholder="Új cím / cél" style={{ flex: 1 }} />
          <input value={indoklas} onChange={(e) => setIndoklas(e.target.value)} placeholder="Oka" style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handleSave}>
            Mentés
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
            Mégse
          </button>
        </div>
      )}
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}

interface TemetesData {
  id: string;
  datuma: string;
  person: PersonRef & { elhunytDatuma: string | null };
  sirhely: { jelzes: string; parcella: { jelzes: string; cemetery: { nev: string } } };
}

function Temetesek({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const { ev, setEv, items, loading, error, load } = useYearlyRegister<TemetesData>("/api/anyakonyv/temetesek", gyulekezetId);

  return (
    <div className="card stack">
      <RegisterHeader icon={IconCross} title="Temetési anyakönyv" count={items.length} ev={ev} tone="graphite" />
      <YearPicker ev={ev} setEv={setEv} onRefresh={load} loading={loading} />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {items.map((t) => (
          <PersonRow
            key={t.id}
            personId={t.person.id}
            nev={`${t.person.vezeteknev} ${t.person.keresztnev}`}
            korInfo={t.person.elhunytDatuma && calcAge(t.person.szuletesiDatum, t.person.elhunytDatuma) !== null ? `${calcAge(t.person.szuletesiDatum, t.person.elhunytDatuma)} év` : null}
            gyulekezetNev={t.person.gyulekezet.nev}
            showGyulekezetNev={showGyulekezetNev}
            eventLabel={`temetés: ${t.datuma.slice(0, 10)}`}
            meta={`${t.sirhely.parcella.cemetery.nev}, ${t.sirhely.parcella.jelzes}/${t.sirhely.jelzes}${
              t.person.elhunytDatuma ? ` · elhalálozás: ${t.person.elhunytDatuma.slice(0, 10)}` : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}
