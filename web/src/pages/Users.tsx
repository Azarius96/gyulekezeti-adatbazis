import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import type { UserRoleEntry } from "../lib/types";

interface UserRow {
  id: string;
  email: string;
  nev: string;
  active: boolean;
  lockedUntil: string | null;
  roles: UserRoleEntry[];
}

interface EgyhazmegyeOption {
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

export function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [egyhazmegyek, setEgyhazmegyek] = useState<EgyhazmegyeOption[]>([]);
  const gyulekezetek = useGyulekezetek();

  function load() {
    api
      .get<UserRow[]>("/api/users")
      .then(setUsers)
      .catch(() => setError("Nem sikerült betölteni a felhasználókat (csak rendszergazda érheti el)"));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get<EgyhazmegyeOption[]>("/api/egyhazmegyek").then(setEgyhazmegyek).catch(() => {});
  }, []);

  function gyulekezetNev(id: string | null) {
    if (!id) return null;
    return gyulekezetek.find((g) => g.id === id)?.nev ?? id;
  }

  function egyhazmegyeNev(id: string | null) {
    if (!id) return null;
    return egyhazmegyek.find((em) => em.id === id)?.nev ?? id;
  }

  async function toggleActive(u: UserRow) {
    await api.put(`/api/users/${u.id}/active`, { active: !u.active });
    load();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Felhasználók</h1>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Mégse" : "Új lelkész / felhasználó"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {showForm && (
        <NewUserForm
          gyulekezetek={gyulekezetek}
          egyhazmegyek={egyhazmegyek}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        {users.map((u) => (
          <div key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="row" style={{ justifyContent: "space-between", padding: "16px 24px" }}>
              <div>
                <strong>{u.nev}</strong> — {u.email}
                <div style={{ color: "var(--color-text-muted)" }}>
                  {u.roles.length === 0 && "— nincs szerepkör —"}
                  {u.roles
                    .map((r) => {
                      const gy = gyulekezetNev(r.gyulekezetId);
                      const em = egyhazmegyeNev(r.egyhazmegyeId);
                      const kiegeszites =
                        gy ? ` (${gy})`
                        : em ? ` (${em} egyházmegye)`
                        : r.gyulekezetId === null && (r.szerepKor === "LELKESZ" || r.szerepKor === "DELEGALT") ? " (gyülekezet még nincs hozzárendelve)"
                        : r.szerepKor === "ESPERES" && !em ? " (egyházmegye még nincs hozzárendelve)"
                        : "";
                      return `${szerepLabels[r.szerepKor] ?? r.szerepKor}${kiegeszites}`;
                    })
                    .join(", ")}
                  {!u.active ? " · inaktív" : ""}
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? " · zárolva" : ""}
                </div>
              </div>
              <div className="row">
                <button
                  className="btn btn-secondary"
                  onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                >
                  {expandedId === u.id ? "Bezárás" : "Szerepkörök kezelése"}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleActive(u)}>
                  {u.active ? "Letiltás" : "Engedélyezés"}
                </button>
              </div>
            </div>
            {expandedId === u.id && (
              <div className="stack" style={{ padding: "0 24px 20px 24px" }}>
                <PasswordResetForm userId={u.id} />
                <RoleEditor
                  user={u}
                  gyulekezetek={gyulekezetek}
                  egyhazmegyek={egyhazmegyek}
                  gyulekezetNev={gyulekezetNev}
                  egyhazmegyeNev={egyhazmegyeNev}
                  onChanged={load}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PasswordResetForm({ userId }: { userId: string }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setSaving(true);
    try {
      await api.put(`/api/users/${userId}/password`, { password });
      setPassword("");
      setDone(true);
    } catch {
      setError("Nem sikerült beállítani a jelszót (legalább 10 karakter szükséges)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack" style={{ background: "var(--color-bg)" }}>
      <strong>Új jelszó megadása</strong>
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        A megadott ideiglenes jelszóval a felhasználó azonnal be tud jelentkezni - érdemes kérni, hogy első
        belépéskor változtassa meg.
      </p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Új jelszó (min. 10 karakter)</label>
          <input required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={saving}>
          {saving ? "Mentés..." : "Jelszó beállítása"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      {done && <p style={{ color: "var(--color-primary-dark)", margin: 0 }}>Az új jelszó beállítva.</p>}
    </form>
  );
}

function RoleEditor({
  user,
  gyulekezetek,
  egyhazmegyek,
  gyulekezetNev,
  egyhazmegyeNev,
  onChanged,
}: {
  user: UserRow;
  gyulekezetek: { id: string; nev: string }[];
  egyhazmegyek: EgyhazmegyeOption[];
  gyulekezetNev: (id: string | null) => string | null;
  egyhazmegyeNev: (id: string | null) => string | null;
  onChanged: () => void;
}) {
  const [szerepKor, setSzerepKor] = useState("LELKESZ");
  const [gyulekezetId, setGyulekezetId] = useState("");
  const [egyhazmegyeId, setEgyhazmegyeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addRole() {
    setError(null);
    if ((szerepKor === "LELKESZ" || szerepKor === "DELEGALT") && !gyulekezetId) {
      setError("Ehhez a szerepkörhöz gyülekezetet is meg kell adni");
      return;
    }
    if (szerepKor === "ESPERES" && !egyhazmegyeId) {
      setError("Esperes szerepkörhöz meg kell adni, melyik egyházmegye esperese");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/users/${user.id}/roles`, {
        szerepKor,
        gyulekezetId: gyulekezetId || null,
        egyhazmegyeId: szerepKor === "ESPERES" ? egyhazmegyeId || null : null,
      });
      setGyulekezetId("");
      setEgyhazmegyeId("");
      onChanged();
    } catch {
      setError("Nem sikerült hozzáadni a szerepkört (esetleg már létezik ugyanilyen)");
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(roleId: string) {
    await api.delete(`/api/users/${user.id}/roles/${roleId}`);
    onChanged();
  }

  return (
    <div className="card stack" style={{ background: "var(--color-bg)" }}>
      <strong>Szerepkörök</strong>
      {user.roles.length === 0 && <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Nincs még szerepköre.</p>}
      {user.roles.map((r) => (
        <div key={r.id} className="row" style={{ justifyContent: "space-between" }}>
          <span>
            {szerepLabels[r.szerepKor] ?? r.szerepKor}
            {gyulekezetNev(r.gyulekezetId) ? ` — ${gyulekezetNev(r.gyulekezetId)}` : ""}
            {egyhazmegyeNev(r.egyhazmegyeId) ? ` — ${egyhazmegyeNev(r.egyhazmegyeId)} egyházmegye` : ""}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => removeRole(r.id)}>
            Eltávolítás
          </button>
        </div>
      ))}

      <div className="row" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
        <select value={szerepKor} onChange={(e) => setSzerepKor(e.target.value)}>
          <option value="LELKESZ">Lelkész</option>
          <option value="DELEGALT">Delegált</option>
          <option value="ESPERES">Esperes</option>
          <option value="PUSPOK">Püspök</option>
          <option value="ADMIN">Rendszergazda</option>
        </select>
        {(szerepKor === "LELKESZ" || szerepKor === "DELEGALT") && (
          <select value={gyulekezetId} onChange={(e) => setGyulekezetId(e.target.value)}>
            <option value="">— válasszon gyülekezetet —</option>
            {gyulekezetek.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nev}
              </option>
            ))}
          </select>
        )}
        {szerepKor === "ESPERES" && (
          <select value={egyhazmegyeId} onChange={(e) => setEgyhazmegyeId(e.target.value)}>
            <option value="">— válasszon egyházmegyét —</option>
            {egyhazmegyek.map((em) => (
              <option key={em.id} value={em.id}>
                {em.nev}
              </option>
            ))}
          </select>
        )}
        <button className="btn" type="button" disabled={saving} onClick={addRole}>
          Szerepkör hozzáadása
        </button>
      </div>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        Ha egy lelkész több gyülekezetet is vezet, adjon hozzá több "Lelkész" szerepkört, mindegyikhez másik
        gyülekezettel. Az esperes szerepkör az egész egyházmegyéhez ad hozzáférést (olvasásra), nem egyetlen
        gyülekezethez.
      </p>
    </div>
  );
}

function NewUserForm({
  gyulekezetek,
  egyhazmegyek,
  onCreated,
}: {
  gyulekezetek: { id: string; nev: string }[];
  egyhazmegyek: EgyhazmegyeOption[];
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [nev, setNev] = useState("");
  const [password, setPassword] = useState("");
  const [szerepKor, setSzerepKor] = useState("LELKESZ");
  const [gyulekezetId, setGyulekezetId] = useState("");
  const [egyhazmegyeId, setEgyhazmegyeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (szerepKor === "ESPERES" && !egyhazmegyeId) {
      setError("Esperes szerepkörhöz meg kell adni, melyik egyházmegye esperese");
      return;
    }
    try {
      await api.post("/api/users", {
        email,
        nev,
        password,
        roles: [
          {
            szerepKor,
            gyulekezetId: gyulekezetId || null,
            egyhazmegyeId: szerepKor === "ESPERES" ? egyhazmegyeId || null : null,
          },
        ],
      });
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni a felhasználót (lehet, hogy az e-mail cím már foglalt, vagy a jelszó túl rövid)");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Egy felhasználónak később több szerepköre és több gyülekezete is lehet — ezt itt egy alapszerepkörrel hozza
        létre, a további szerepköröket a felhasználó adatlapján bővítheti.
      </p>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Név</label>
          <input required value={nev} onChange={(e) => setNev(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>E-mail</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Ideiglenes jelszó (min. 10 karakter)</label>
          <input required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Szerepkör</label>
          <select value={szerepKor} onChange={(e) => setSzerepKor(e.target.value)}>
            <option value="LELKESZ">Lelkész</option>
            <option value="ESPERES">Esperes</option>
            <option value="PUSPOK">Püspök</option>
            <option value="ADMIN">Rendszergazda</option>
          </select>
        </div>
        {szerepKor === "LELKESZ" && (
          <div className="field" style={{ flex: 1 }}>
            <label>Gyülekezet (üresen hagyható — a lelkész első belépéskor létrehozhatja)</label>
            <select value={gyulekezetId} onChange={(e) => setGyulekezetId(e.target.value)}>
              <option value="">— nincs még hozzárendelve —</option>
              {gyulekezetek.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nev}
                </option>
              ))}
            </select>
          </div>
        )}
        {szerepKor === "ESPERES" && (
          <div className="field" style={{ flex: 1 }}>
            <label>Melyik egyházmegye esperese</label>
            <select value={egyhazmegyeId} onChange={(e) => setEgyhazmegyeId(e.target.value)}>
              <option value="">— válasszon egyházmegyét —</option>
              {egyhazmegyek.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.nev}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn" type="submit">
        Létrehozás
      </button>
    </form>
  );
}
