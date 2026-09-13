import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { isAdmin } from "../lib/types";
import type { DashboardStats } from "../lib/types";

interface GyulekezetOverview {
  id: string;
  nev: string;
  users: { id: string; nev: string; email: string; szerepKor: string; active: boolean }[];
  _count: { persons: number };
}

interface Egyhazmegye {
  id: string;
  nev: string;
}

const szerepLabels: Record<string, string> = {
  ADMIN: "Rendszergazda",
  PUSPOK: "Püspök",
  ESPERES: "Esperes",
  LELKESZ: "Lelkész",
  DELEGALT: "Delegált",
};

export function Gyulekezetek() {
  const { user } = useAuth();
  if (!isAdmin(user)) return <EsperesMegyeiNezet />;
  return <AdminGyulekezetekLista />;
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{value}</div>
      <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{label}</div>
    </div>
  );
}

function StatGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
      <StatTile label="Élő tagok" value={stats.osszlétszám} />
      <StatTile label="Férfiak" value={stats.ferfiak} />
      <StatTile label="Nők" value={stats.nok} />
      <StatTile label="Presbiterek" value={stats.presbiterek} />
      <StatTile label="Gondnokok" value={stats.gondnokok} />
      <StatTile label="Nőszövetség" value={stats.noszovetseg} />
      <StatTile label="Elhunytak idén" value={stats.elhunytakIdenre} />
    </div>
  );
}

/** Az esperes itt (a "Gyülekezetek" fülön) megyei nézetet lát: felül az egész egyházmegye
 * összesített statisztikái, jól elhatárolva alatta a hozzá tartozó gyülekezetek listája, mindegyik
 * a saját statisztikáival és a választói névjegyzékéhez vezető - csak olvasásra szolgáló - linkkel.
 * Szerkesztési jog itt nincs, azt továbbra is csak a gyülekezet saját lelkésze/delegáltja kap. */
function EsperesMegyeiNezet() {
  const [megyeStats, setMegyeStats] = useState<DashboardStats | null>(null);
  const [gyulekezetek, setGyulekezetek] = useState<{ id: string; nev: string; _count: { persons: number } }[]>([]);
  const [gyulekezetStats, setGyulekezetStats] = useState<Record<string, DashboardStats>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardStats>("/api/dashboard/stats").then(setMegyeStats).catch(() => setError("Nem sikerült betölteni a megyei statisztikát"));
    api
      .get<{ id: string; nev: string; _count: { persons: number } }[]>("/api/gyulekezetek")
      .then((list) => {
        setGyulekezetek(list);
        list.forEach((g) => {
          api
            .get<DashboardStats>(`/api/dashboard/stats?gyulekezetId=${g.id}`)
            .then((s) => setGyulekezetStats((prev) => ({ ...prev, [g.id]: s })))
            .catch(() => {});
        });
      })
      .catch(() => setError("Nem sikerült betölteni a gyülekezeteket"));
  }, []);

  return (
    <div className="stack">
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Gyülekezetek — megyei nézet</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Az egyházmegyéjéhez tartozó gyülekezetek áttekintése. A gyülekezetek adatait és a választói névjegyzéket csak
        megtekintheti - szerkesztésükhöz a gyülekezet saját lelkésze/delegáltja jogosult.
      </p>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházmegyei statisztika (összesítve)</h2>
        {megyeStats ? <StatGrid stats={megyeStats} /> : <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Betöltés...</p>}
      </div>

      <div
        className="stack"
        style={{ gap: 16, borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)", marginTop: "var(--space-2)" }}
      >
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Gyülekezeteim</h2>
        {gyulekezetek.length === 0 && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs elérhető gyülekezet.</p>}
        {gyulekezetek.map((g) => {
          const s = gyulekezetStats[g.id];
          return (
            <div key={g.id} className="card stack">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "var(--font-size-lg)" }}>{g.nev}</strong>
                <Link className="btn btn-secondary btn-sm" to={`/valasztoi-nevjegyzek?gyulekezetId=${g.id}`}>
                  Választók névjegyzéke (megtekintés)
                </Link>
              </div>
              {s ? <StatGrid stats={s} /> : <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Statisztika betöltése...</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminGyulekezetekLista() {
  const [list, setList] = useState<GyulekezetOverview[]>([]);
  const [egyhazmegyek, setEgyhazmegyek] = useState<Egyhazmegye[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<GyulekezetOverview[]>("/api/gyulekezetek/attekintes")
      .then(setList)
      .catch(() => setError("Nem sikerült betölteni (csak rendszergazda érheti el)"));
  }

  useEffect(() => {
    load();
    api.get<Egyhazmegye[]>("/api/egyhazmegyek").then(setEgyhazmegyek).catch(() => {});
  }, []);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Gyülekezetek</h1>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Mégse" : "Új gyülekezet"}
        </button>
      </div>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Kattintson egy gyülekezetre a beállítások (egyházfenntartó díj, sírhelymegváltás, alapadatok) szerkesztéséhez.
      </p>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {showForm && (
        <NewGyulekezetForm
          egyhazmegyek={egyhazmegyek}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {list.map((g) => (
        <Link key={g.id} to={`/gyulekezetek/${g.id}`} className="card stack" style={{ color: "inherit", textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: "var(--font-size-lg)" }}>{g.nev}</strong>
            <span style={{ color: "var(--color-text-muted)" }}>{g._count.persons} személy</span>
          </div>
          {g.users.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs hozzárendelt lelkész/felhasználó.</p>
          ) : (
            g.users.map((u) => (
              <div key={u.id}>
                {u.nev} — {szerepLabels[u.szerepKor] ?? u.szerepKor} ({u.email}){!u.active ? " · inaktív" : ""}
              </div>
            ))
          )}
        </Link>
      ))}
    </div>
  );
}

function NewGyulekezetForm({ egyhazmegyek, onCreated }: { egyhazmegyek: Egyhazmegye[]; onCreated: () => void }) {
  const [nev, setNev] = useState("");
  const [romanCim, setRomanCim] = useState("");
  const [postaiCim, setPostaiCim] = useState("");
  const [egyhazmegyeId, setEgyhazmegyeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!egyhazmegyeId && egyhazmegyek.length > 0) setEgyhazmegyeId(egyhazmegyek[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egyhazmegyek]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/api/gyulekezetek", {
        nev,
        egyhazmegyeId: egyhazmegyeId || null,
        romanCim: romanCim || null,
        postaiCim: postaiCim || null,
      });
      setNev("");
      setRomanCim("");
      setPostaiCim("");
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni a gyülekezetet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <h3 style={{ margin: 0 }}>Új gyülekezet</h3>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Név</label>
          <input required value={nev} onChange={(e) => setNev(e.target.value)} placeholder="pl. Búzásbocsárdi Református Egyházközség" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Egyházmegye</label>
          <select value={egyhazmegyeId} onChange={(e) => setEgyhazmegyeId(e.target.value)}>
            {egyhazmegyek.length === 0 && <option value="">— nincs felvéve egyházmegye —</option>}
            {egyhazmegyek.map((em) => (
              <option key={em.id} value={em.id}>
                {em.nev}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Postacím (irányítószámmal, hivatalos iratokhoz)</label>
          <input value={postaiCim} onChange={(e) => setPostaiCim(e.target.value)} placeholder="pl. 517261 Bucerdea Grânoasă, Petőfi Sándor 4, Jud. Alba" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Cím románul (a román nyelvű iratokhoz)</label>
          <input value={romanCim} onChange={(e) => setRomanCim(e.target.value)} placeholder="pl. Bucerdea Grânoasă, str. Petőfi Sándor nr. 4, jud. Alba" />
        </div>
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Létrehozás..." : "Létrehozás"}
      </button>
    </form>
  );
}
