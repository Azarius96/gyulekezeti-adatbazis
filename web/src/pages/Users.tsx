import { useEffect, useState, type FormEvent } from "react";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
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
  paymentPaidAt: string | null;
  paymentValidUntil: string | null;
}

interface DeletedUserRow {
  id: string;
  email: string;
  nev: string;
  deletedAt: string;
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
  const [selectedGyulekezetId] = useSelectedGyulekezet();
  const [allUsers, setUsers] = useState<UserRow[]>([]);
  const users = selectedGyulekezetId
    ? allUsers.filter((u) => u.roles.some((r) => r.gyulekezetId === selectedGyulekezetId))
    : allUsers;
  const [deletedUsers, setDeletedUsers] = useState<DeletedUserRow[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
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
    api
      .get<DeletedUserRow[]>("/api/users/deleted")
      .then(setDeletedUsers)
      .catch(() => {});
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

  async function deleteUser(u: UserRow) {
    if (!confirm(`Biztosan törli "${u.nev}" felhasználót? A papírkosárból később visszaállítható.`)) return;
    await api.delete(`/api/users/${u.id}`);
    load();
  }

  async function restoreUser(u: DeletedUserRow) {
    await api.post(`/api/users/${u.id}/restore`);
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
                {u.paymentValidUntil && (
                  <div style={{ color: new Date(u.paymentValidUntil) < new Date() ? "var(--color-danger)" : "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                    Fizetési érvényesség: {new Date(u.paymentValidUntil).toLocaleDateString("hu-HU")}
                    {new Date(u.paymentValidUntil) < new Date() ? " · lejárt" : ""}
                  </div>
                )}
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
                <button className="btn btn-danger" onClick={() => deleteUser(u)}>
                  Törlés
                </button>
              </div>
            </div>
            {expandedId === u.id && (
              <div className="stack" style={{ padding: "0 24px 20px 24px" }}>
                <PasswordResetForm userId={u.id} />
                <PaymentEditor user={u} onChanged={load} />
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

      {deletedUsers.length > 0 && (
        <div className="stack">
          <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? "Törölt felhasználók elrejtése" : `Törölt felhasználók megjelenítése (${deletedUsers.length})`}
          </button>
          {showDeleted && (
            <div className="card" style={{ padding: 0 }}>
              {deletedUsers.map((u) => (
                <div
                  key={u.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--color-border)" }}
                >
                  <div>
                    <strong>{u.nev}</strong> — {u.email}
                    <div style={{ color: "var(--color-text-muted)" }}>
                      {u.roles.map((r) => szerepLabels[r.szerepKor] ?? r.szerepKor).join(", ") || "— nincs szerepkör —"}
                      {" · törölve: "}
                      {new Date(u.deletedAt).toLocaleDateString("hu-HU")}
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => restoreUser(u)}>
                    Visszaállítás
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function PaymentEditor({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const [paidAt, setPaidAt] = useState(toDateInputValue(user.paymentPaidAt) || new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(toDateInputValue(user.paymentValidUntil));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyDuration(months: number) {
    setValidUntil(addMonths(paidAt, months));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/users/${user.id}/payment`, {
        paymentPaidAt: paidAt || null,
        paymentValidUntil: validUntil || null,
      });
      onChanged();
    } catch {
      setError("Nem sikerült menteni");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setPaidAt("");
    setValidUntil("");
    setSaving(true);
    try {
      await api.put(`/api/users/${user.id}/payment`, { paymentPaidAt: null, paymentValidUntil: null });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack" style={{ background: "var(--color-bg)" }}>
      <strong>Fizetési határidő</strong>
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        Ha be van állítva "érvényes eddig" dátum, a lejárat előtt 1 hónappal a felhasználó piros
        figyelmeztetést lát a fejlécen; a lejárat után nem tud bejelentkezni, amíg új kifizetés
        nem kerül rögzítésre. Üresen hagyva nincs korlátozás.
      </p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Mikor fizetett</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Érvényesség hossza</label>
          <select value="" onChange={(e) => e.target.value && applyDuration(Number(e.target.value))}>
            <option value="">— válasszon —</option>
            <option value="1">1 hónap</option>
            <option value="3">3 hónap</option>
            <option value="6">6 hónap</option>
            <option value="12">12 hónap</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Érvényes eddig</label>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <button className="btn btn-secondary" type="button" disabled={saving} onClick={save}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        {(user.paymentPaidAt || user.paymentValidUntil) && (
          <button className="btn btn-secondary" type="button" disabled={saving} onClick={clear}>
            Korlátozás törlése
          </button>
        )}
      </div>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
    </div>
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
