import { useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { GyulekezetSelect, useGyulekezetek } from "../components/GyulekezetSelect";
import { IconWallet, IconGift, IconUsers, IconClock } from "../components/icons";
import { canEditGyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Gomb egy .field-ekből álló soron belül. A láthatatlan címke ugyanakkora helyet foglal,
 * mint a mellette lévő mezők valódi címkéje, így a gomb alja pontosan a beviteli mezők
 * aljához igazodik (nem csúszik el tőlük függőlegesen).
 */
function FieldButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <div className="field">
      <label style={{ visibility: "hidden" }}>_</label>
      <button {...props}>{children}</button>
    </div>
  );
}

type Tab = "tartozasok" | "befizetesek" | "adomanyok" | "osszesito";

const TABS: { id: Tab; label: string }[] = [
  { id: "osszesito", label: "Összesítő" },
  { id: "tartozasok", label: "Tartozások" },
  { id: "befizetesek", label: "Befizetések" },
  { id: "adomanyok", label: "Adományok" },
];

interface OsszesitoData {
  ev: number;
  egyhazfenntartoBefolyt: number;
  adomanyBefolyt: number;
  fizetendoSzemelyek: number;
  fizetokSzama: number;
  tartozokSzama: number;
  osszesTartozas: number;
  nyitoTartozasSzemelyek: number;
  nyitoTartozasOsszeg: number;
  mentesSzemelyek: number;
  kedvezmenyesSzemelyek: number;
}

function HeroStatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number | string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: "primary" | "muted" | "accent" | "blue";
}) {
  const toneClass = {
    primary: "icon-tile--green",
    muted: "icon-tile--muted",
    accent: "icon-tile--orange",
    blue: "icon-tile--blue",
  }[tone];

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div className={`icon-tile ${toneClass}`} style={{ marginBottom: 14 }}>
        <Icon style={{ width: 22, height: 22 }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

/** Mindig a folyó évet mutatja, a kiválasztott fültől függetlenül - így elsőre, egy
 * pillantással látszik a jelenlegi állás, mielőtt bárki belemenne a részletekbe. */
function PenzugyiHero({ gyulekezetId }: { gyulekezetId: string }) {
  const [data, setData] = useState<OsszesitoData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("ev", String(CURRENT_YEAR));
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<OsszesitoData>(`/api/penzugyi-osszesito?${params.toString()}`)
      .then(setData)
      .catch(() => setData(null));
  }, [gyulekezetId]);

  if (!data) return null;

  return (
    <div className="card-grid">
      <HeroStatCard label={`Egyházfenntartó (${CURRENT_YEAR})`} value={`${data.egyhazfenntartoBefolyt} lej`} icon={IconWallet} tone="blue" />
      <HeroStatCard label={`Adomány (${CURRENT_YEAR})`} value={`${data.adomanyBefolyt} lej`} icon={IconGift} tone="accent" />
      <HeroStatCard label="Már fizettek" value={data.fizetokSzama} icon={IconUsers} tone="primary" />
      <HeroStatCard label="Még tartoznak (idénre)" value={data.tartozokSzama} icon={IconClock} tone="muted" />
    </div>
  );
}

export function Penzugyek() {
  const gyulekezetek = useGyulekezetek();
  const [gyulekezetId, setGyulekezetId] = useState("");
  const [tab, setTab] = useState<Tab>("osszesito");

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Pénzügyek</h1>
        <GyulekezetSelect value={gyulekezetId} onChange={setGyulekezetId} gyulekezetek={gyulekezetek} />
      </div>

      <PenzugyiHero gyulekezetId={gyulekezetId} />

      <div className="row" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "btn" : "btn btn-secondary"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "osszesito" && <Osszesito gyulekezetId={gyulekezetId} showGyulekezetNev={gyulekezetek.length > 1} />}
      {tab === "tartozasok" && <Tartozasok gyulekezetId={gyulekezetId} showGyulekezetNev={gyulekezetek.length > 1} />}
      {tab === "befizetesek" && <Ledger gyulekezetId={gyulekezetId} kind="dues" />}
      {tab === "adomanyok" && <Ledger gyulekezetId={gyulekezetId} kind="donation" />}
    </div>
  );
}

function Osszesito({ gyulekezetId }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
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
      .get<OsszesitoData>(`/api/penzugyi-osszesito?${params.toString()}`)
      .then(setData)
      .catch(() => setError("Nem sikerült betölteni az összesítőt"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [gyulekezetId]);

  const rows = data
    ? [
        { label: "Egyházfenntartóból befolyt", value: `${data.egyhazfenntartoBefolyt} lej` },
        { label: "Adományból befolyt", value: `${data.adomanyBefolyt} lej` },
        { label: "Fizetésre kötelezett személyek", value: data.fizetendoSzemelyek },
        { label: "Már fizettek", value: data.fizetokSzama },
        { label: "Még tartoznak (erre az évre)", value: data.tartozokSzama },
        { label: "Hátralék (erre az évre)", value: `${data.osszesTartozas} lej` },
        { label: "Korábbi (nyitó) tartozással rendelkezők", value: data.nyitoTartozasSzemelyek },
        { label: "Korábbi (nyitó) tartozás összesen", value: `${data.nyitoTartozasOsszeg} lej` },
        { label: "Mentes személyek", value: data.mentesSzemelyek },
        { label: "Kedvezményes személyek", value: data.kedvezmenyesSzemelyek },
      ]
    : [];

  return (
    <div className="stack">
      <div className="card row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ width: 110 }}>
          <label>Év</label>
          <input type="number" value={ev} onChange={(e) => setEv(e.target.value)} />
        </div>
        <FieldButton className="btn" onClick={load} disabled={loading}>
          {loading ? "Betöltés..." : "Frissítés"}
        </FieldButton>
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {data && (
        <div className="card stack" style={{ padding: 0 }}>
          {rows.map((r) => (
            <div
              key={r.label}
              className="row"
              style={{ justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--color-border)" }}
            >
              <span>{r.label}</span>
              <strong>{r.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DebtorYear {
  ev: number;
  esedekesOsszeg: number;
  fizetve: number;
  hianyzo: number;
  becsult: boolean;
}

interface Debtor {
  personId: string;
  nev: string;
  gyulekezetId: string;
  gyulekezetNev: string;
  osszesTartozas: number;
  korabbiTartozas: number;
  evek: DebtorYear[];
}

interface DebtorsResponse {
  evTol: number;
  evIg: number;
  debtors: Debtor[];
}

/**
 * Kompakt "kifizetés" vezérlő a tartozók listájának egy sorában - a korábbi (nyitó)
 * tartozást csökkenti a megadott összeggel (`Person.nyitoTartozas`), így az illető
 * kikerül a tartozók közül, amint a teljes hátralékot rendezte.
 */
function PayOffOpeningDebt({ personId, osszeg, onDone }: { personId: string; osszeg: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fizetettOsszeg, setFizetettOsszeg] = useState(String(osszeg));
  const [saving, setSaving] = useState(false);

  async function handlePay() {
    const paid = Number(fizetettOsszeg);
    if (!paid || paid <= 0) return;
    setSaving(true);
    try {
      await api.put(`/api/persons/${personId}`, { nyitoTartozas: Math.max(0, osszeg - paid) });
      onDone();
    } finally {
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
    <div className="row" style={{ alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <input
        type="number"
        min="0"
        max={osszeg}
        style={{ width: 90 }}
        value={fizetettOsszeg}
        onChange={(e) => setFizetettOsszeg(e.target.value)}
      />
      <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handlePay}>
        {saving ? "Mentés..." : "Rögzítés"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
        Mégse
      </button>
    </div>
  );
}

function Tartozasok({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const { user } = useAuth();
  // Alapból a tavalyi évet is belevesszük, hogy egy korábbi évről áthúzódó elmaradás sose
  // maradjon rejtve pusztán azért, mert valaki csak a folyó évre nézi meg a listát.
  const [evTol, setEvTol] = useState(String(CURRENT_YEAR - 1));
  const [evIg, setEvIg] = useState(String(CURRENT_YEAR));
  const [data, setData] = useState<DebtorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(tol: string, ig: string) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("evTol", tol);
    params.set("evIg", ig);
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<DebtorsResponse>(`/api/dues-debtors?${params.toString()}`)
      .then(setData)
      .catch(() => setError("Nem sikerült betölteni a listát"))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(evTol, evIg), [gyulekezetId]);

  function includePreviousYears() {
    const tol = String(CURRENT_YEAR - 5);
    setEvTol(tol);
    load(tol, evIg);
  }

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Azok a személyek, akiknek a megadott évek valamelyikére nem lett (teljesen) befizetve az esedékes
        egyházfenntartói járulék.
      </p>
      <div className="card row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 110 }}>
          <label>Évtől</label>
          <input type="number" value={evTol} onChange={(e) => setEvTol(e.target.value)} />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Évig</label>
          <input type="number" value={evIg} onChange={(e) => setEvIg(e.target.value)} />
        </div>
        <FieldButton className="btn" onClick={() => load(evTol, evIg)} disabled={loading}>
          {loading ? "Keresés..." : "Keresés"}
        </FieldButton>
        <FieldButton className="btn btn-secondary" onClick={includePreviousYears} disabled={loading}>
          Korábbi évek is (utolsó 5 év)
        </FieldButton>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {data && (
        <div className="stack">
          <p style={{ margin: 0, fontWeight: 600 }}>
            {data.debtors.length === 0
              ? `Nincs tartozás a(z) ${data.evTol}–${data.evIg} időszakra.`
              : `${data.debtors.length} személy tartozik a(z) ${data.evTol}–${data.evIg} időszakra.`}
          </p>
          {data.debtors.map((d) => {
            const reszletek = [
              ...(d.korabbiTartozas > 0 ? [`korábbi (nyitó) tartozás: ${d.korabbiTartozas} lej`] : []),
              ...d.evek.map((e) => `${e.ev}: ${e.hianyzo} lej hiányzik${e.becsult ? " (becsült, nincs születési dátum)" : ""}`),
            ];
            return (
              <div
                key={d.personId}
                className="card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-2)",
                  background: d.korabbiTartozas > 0 ? "rgba(255, 69, 58, 0.14)" : undefined,
                  borderColor: d.korabbiTartozas > 0 ? "var(--color-danger)" : undefined,
                }}
              >
                <div>
                  <Link to={`/szemelyek/${d.personId}`} style={{ fontWeight: 700 }}>
                    {d.nev}
                  </Link>
                  {showGyulekezetNev && <span style={{ color: "var(--color-text-muted)" }}> — {d.gyulekezetNev}</span>}
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                    {reszletek.join(", ")}
                  </div>
                </div>
                <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                  <strong style={{ color: "var(--color-danger)", whiteSpace: "nowrap" }}>{d.osszesTartozas} lej</strong>
                  {d.korabbiTartozas > 0 && canEditGyulekezet(user, d.gyulekezetId) && (
                    <PayOffOpeningDebt personId={d.personId} osszeg={d.korabbiTartozas} onDone={() => load(evTol, evIg)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface LedgerEntry {
  id: string;
  personId: string;
  nev: string;
  ev: number;
  osszeg: number;
  celja?: string | null;
  fizetesDatuma: string;
}

function Ledger({ gyulekezetId, kind }: { gyulekezetId: string; kind: "dues" | "donation" }) {
  const [ev, setEv] = useState(String(CURRENT_YEAR));
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("ev", ev);
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<LedgerEntry[]>(`/api/${kind === "dues" ? "dues-payments" : "donations"}?${params.toString()}`)
      .then(setEntries)
      .catch(() => setError("Nem sikerült betölteni a listát"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [gyulekezetId, kind]);

  const total = entries ? entries.reduce((sum, e) => sum + e.osszeg, 0) : 0;

  return (
    <div className="stack">
      <div className="card row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ width: 110 }}>
          <label>Év</label>
          <input type="number" value={ev} onChange={(e) => setEv(e.target.value)} />
        </div>
        <FieldButton className="btn" onClick={load} disabled={loading}>
          {loading ? "Keresés..." : "Keresés"}
        </FieldButton>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {entries && (
        <div className="stack">
          <p style={{ margin: 0, fontWeight: 600 }}>
            {entries.length === 0 ? `Nincs bejegyzés ${ev}-re.` : `${entries.length} bejegyzés, összesen ${total} lej.`}
          </p>
          {entries.map((e) => (
            <div key={e.id} className="card row" style={{ justifyContent: "space-between" }}>
              <div>
                <Link to={`/szemelyek/${e.personId}`} style={{ fontWeight: 700 }}>
                  {e.nev}
                </Link>
                <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {new Date(e.fizetesDatuma).toLocaleDateString("hu-HU")}
                  {e.celja ? ` — ${e.celja}` : ""}
                </div>
              </div>
              <strong>{e.osszeg} lej</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
