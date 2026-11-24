import { useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type SVGProps } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { IconWallet, IconGift, IconUsers, IconClock } from "../components/icons";
import { canEditGyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { tartozasPdf } from "../lib/tartozasPdf";
import { age as eletkor } from "../lib/age";

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
  elmaradasCsoportok: Record<"csakIdei" | "egyEv" | "ketEv" | "tobbEv", { fo: number; osszeg: number }>;
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
  const [gyulekezetId] = useSelectedGyulekezet();
  // A kiválasztott fül a címben van (?ful=...), így egy személyről a "Vissza" gombbal ugyanarra a fülre térünk vissza.
  const [params, setParams] = useSearchParams();
  const fulParam = params.get("ful");
  const tab: Tab = TABS.some((t) => t.id === fulParam) ? (fulParam as Tab) : "osszesito";
  const setTab = (t: Tab) => setParams(t === "osszesito" ? {} : { ful: t }, { replace: true });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Pénzügyek</h1>
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

interface KategoriaSzemely {
  id: string;
  nev: string;
  szuletesiDatum: string | null;
  cim: string;
  gyulekezetNev: string;
  esedekesOsszeg: number;
}

/** A mentes / kedvezményes személyek névsora (a számra kattintva nyílik meg). */
function KategoriaLista({ kategoria, ev, gyulekezetId }: { kategoria: "mentes" | "kedvezmenyes"; ev: number; gyulekezetId: string }) {
  const hely = useLocation();
  const vissza = hely.pathname + hely.search;
  const [szemelyek, setSzemelyek] = useState<KategoriaSzemely[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSzemelyek(null);
    const params = new URLSearchParams({ kategoria, ev: String(ev) });
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<{ szemelyek: KategoriaSzemely[] }>(`/api/dues-kategoria?${params.toString()}`)
      .then((r) => setSzemelyek(r.szemelyek))
      .catch(() => setError("Nem sikerült betölteni a névsort"));
  }, [kategoria, ev, gyulekezetId]);
  if (error) return <p style={{ color: "var(--color-danger)", padding: "0 16px" }}>{error}</p>;
  if (!szemelyek) return <p style={{ padding: "0 16px", color: "var(--color-text-muted)" }}>Betöltés...</p>;
  return (
    <div className="stack" style={{ gap: 0, padding: "4px 16px 12px", background: "var(--color-surface-alt)" }}>
      {szemelyek.length === 0 && <span style={{ color: "var(--color-text-muted)" }}>Nincs ilyen személy.</span>}
      {szemelyek.map((p) => (
        <div key={p.id} className="row" style={{ justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid var(--color-border)" }}>
          <span>
            <Link to={`/szemelyek/${p.id}`} state={{ vissza }} style={{ fontWeight: 600 }}>
              {p.nev}
            </Link>
            {eletkor(p.szuletesiDatum) !== null && <span> ({eletkor(p.szuletesiDatum)} év)</span>}
            {p.cim && <span style={{ color: "var(--color-text-muted)" }}> — {p.cim}</span>}
          </span>
          {kategoria === "kedvezmenyes" && <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{p.esedekesOsszeg} lej/év</span>}
        </div>
      ))}
    </div>
  );
}

function Osszesito({ gyulekezetId }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const [nyitott, setNyitott] = useState<"mentes" | "kedvezmenyes" | null>(null);
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
        { label: "Mentes személyek", value: data.mentesSzemelyek, kategoria: "mentes" as const },
        { label: "Kedvezményes személyek", value: data.kedvezmenyesSzemelyek, kategoria: "kedvezmenyes" as const },
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
            <div key={r.label}>
              {"kategoria" in r && r.kategoria ? (
                <button
                  type="button"
                  className="esemeny-kicsi"
                  onClick={() => setNyitott(nyitott === r.kategoria ? null : r.kategoria)}
                  style={{ justifyContent: "space-between", padding: "10px 16px", borderTop: 0, borderBottom: "1px solid var(--color-border)", alignItems: "center" }}
                  title="Kattints a névsor megnyitásához"
                >
                  <span style={{ color: "var(--color-primary-dark)", textDecoration: "underline" }}>
                    {r.label} {nyitott === r.kategoria ? "▾" : "▸"}
                  </span>
                  <strong>{r.value}</strong>
                </button>
              ) : (
                <div className="row" style={{ justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--color-border)" }}>
                  <span>{r.label}</span>
                  <strong>{r.value}</strong>
                </div>
              )}
              {"kategoria" in r && r.kategoria && nyitott === r.kategoria && (
                <KategoriaLista kategoria={r.kategoria} ev={data.ev} gyulekezetId={gyulekezetId} />
              )}
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="card stack" style={{ gap: 6 }}>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Elmaradások száma (a mai állapot szerint)</h2>
          <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            Hány évre van elmaradása a tagoknak az utolsó 5 évben. A rendszer bevezetése előtti (korábbi) tartozás a "több mint 2 évre" csoportba számít.
          </p>
          {(
            [
              ["Csak az idei évre elmaradt", data.elmaradasCsoportok.csakIdei],
              ["1 évre elmaradt (összesen)", data.elmaradasCsoportok.egyEv],
              ["2 évre elmaradt", data.elmaradasCsoportok.ketEv],
              ["Több mint 2 évre elmaradt", data.elmaradasCsoportok.tobbEv],
            ] as const
          ).map(([label, c]) => (
            <div key={label} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
              <span>{label}</span>
              <strong>
                {c.fo} fő <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>· {Math.round(c.osszeg)} lej</span>
              </strong>
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
  befizetesek: { osszeg: number; datum: string; nyugta: string | null }[];
}

interface Debtor {
  personId: string;
  nev: string;
  cim: string;
  szuletesiDatum: string | null;
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

/** Tartozás kifizetése (részben vagy egészben): a befizetett összeg a legrégebbi hátralékra számolódik el
 * (előbb a nyitó tartozásra, majd évenként növekvő sorrendben az egyes évek hiányzó összegére), így
 * a személy a lista maradék tartozásával marad, vagy kikerül belőle, ha mindent rendezett. */
function PayDebt({
  personId,
  osszeg,
  evTol,
  evIg,
  onDone,
}: {
  personId: string;
  osszeg: number;
  evTol: number;
  evIg: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fizetettOsszeg, setFizetettOsszeg] = useState(String(osszeg));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    const paid = Number(fizetettOsszeg);
    if (!paid || paid <= 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/dues-debtors/pay", { personId, osszeg: paid, evTol, evIg });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült rögzíteni");
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
    <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
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
      {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</span>}
    </div>
  );
}

function Tartozasok({ gyulekezetId, showGyulekezetNev }: { gyulekezetId: string; showGyulekezetNev: boolean }) {
  const hely = useLocation();
  const vissza = hely.pathname + hely.search;
  const { user } = useAuth();
  // Alapból a két előző évet is belevesszük (ugyanúgy, mint a személy-/háztartásnézet tartozása), hogy
  // egy korábbi évről áthúzódó elmaradás sose maradjon rejtve pusztán azért, mert valaki csak a folyó évre nézi a listát.
  const [evTol, setEvTol] = useState(String(CURRENT_YEAR - 2));
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
        <FieldButton
          className="btn btn-secondary"
          disabled={loading || !data || data.debtors.length === 0}
          onClick={() => {
            if (!data) return;
            const nevek = Array.from(new Set(data.debtors.map((d) => d.gyulekezetNev)));
            tartozasPdf(data.debtors, data.evTol, data.evIg, nevek.length === 1 ? nevek[0] : "", nevek.length > 1);
          }}
          title="Nyomtatható kimutatás: a részben fizetők nyugtaszámmal és dátummal, majd az összes tartozó cím szerint (PDF-be menthető)"
        >
          PDF letöltése
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
              ...d.evek.map((e) => `${e.ev}. évre: ${e.hianyzo} lej hiányzik${e.becsult ? " (becsült, nincs születési dátum)" : ""}`),
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
                  <Link to={`/szemelyek/${d.personId}`} state={{ vissza }} style={{ fontWeight: 700 }}>
                    {d.nev}
                  </Link>
                  {eletkor(d.szuletesiDatum) !== null && <span style={{ fontWeight: 400 }}> ({eletkor(d.szuletesiDatum)} év)</span>}
                  {(d.cim || showGyulekezetNev) && <span style={{ color: "var(--color-text-muted)" }}> — {d.cim || d.gyulekezetNev}</span>}
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                    {reszletek.join(", ")}
                  </div>
                </div>
                <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                  <strong style={{ color: "var(--color-danger)", whiteSpace: "nowrap" }}>{d.osszesTartozas} lej</strong>
                  {canEditGyulekezet(user, d.gyulekezetId) && (
                    <PayDebt
                      personId={d.personId}
                      osszeg={d.osszesTartozas}
                      evTol={data.evTol}
                      evIg={data.evIg}
                      onDone={() => load(evTol, evIg)}
                    />
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
  const hely = useLocation();
  const vissza = hely.pathname + hely.search;
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
                <Link to={`/szemelyek/${e.personId}`} state={{ vissza }} style={{ fontWeight: 700 }}>
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
