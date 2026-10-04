import { useEffect, useState, type FormEvent } from "react";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { isAdmin } from "../lib/types";

interface Kerulet {
  id: string;
  nev: string;
}

interface Egyhazmegye {
  id: string;
  nev: string;
  keruletId: string;
  kerulet: { id: string; nev: string };
}

interface GyulekezetSzervezetView {
  id: string;
  nev: string;
  egyhazmegyeNev: string;
  keruletNev: string;
  lelkeszek: { id: string; nev: string; email: string; active: boolean }[];
  gondnokok: { id: string; nev: string; tisztseg: string }[];
  presbiterek: { id: string; nev: string; tisztseg: string }[];
}

export function Szervezet() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [keruletek, setKeruletek] = useState<Kerulet[]>([]);
  const [egyhazmegyek, setEgyhazmegyek] = useState<Egyhazmegye[]>([]);
  const [selectedGyulekezetId] = useSelectedGyulekezet();
  const [allGyulekezetek, setGyulekezetek] = useState<GyulekezetSzervezetView[]>([]);
  const gyulekezetek = selectedGyulekezetId ? allGyulekezetek.filter((g) => g.id === selectedGyulekezetId) : allGyulekezetek;
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Kerulet[]>("/api/keruletek").then(setKeruletek).catch(() => setError("Nem sikerült betölteni"));
    api.get<Egyhazmegye[]>("/api/egyhazmegyek").then(setEgyhazmegyek).catch(() => {});
    api.get<GyulekezetSzervezetView[]>("/api/szervezet/gyulekezetek").then(setGyulekezetek).catch(() => {});
  }

  useEffect(load, []);

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Szervezeti felépítés</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházkerületek</h2>
        {keruletek.map((k) => (
          <KeruletRow key={k.id} kerulet={k} onChanged={load} canEdit={admin} />
        ))}
        {admin && <NewKeruletForm onCreated={load} />}
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházmegyék</h2>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Minden egyházmegyéhez válassza ki, melyik egyházkerülethez tartozik.
        </p>
        {egyhazmegyek.map((em) => (
          <EgyhazmegyeRow key={em.id} egyhazmegye={em} keruletek={keruletek} onChanged={load} canEdit={admin} />
        ))}
        {admin && <NewEgyhazmegyeForm keruletek={keruletek} onCreated={load} />}
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Gyülekezetek</h2>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Minden gyülekezet a lelkészével, gondnokával és presbitereivel.
        </p>
        {gyulekezetek.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs elérhető gyülekezet.</p>
        )}
        {gyulekezetek.map((g) => (
          <div
            key={g.id}
            className="stack"
            style={{ gap: 8, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{g.nev}</strong>
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                {g.egyhazmegyeNev} · {g.keruletNev}
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {g.lelkeszek.length === 0 ? (
                <span className="badge-sm">nincs lelkész hozzárendelve</span>
              ) : (
                g.lelkeszek.map((l) => (
                  <span key={l.id} className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
                    Lelkész: {l.nev}
                    {!l.active ? " (inaktív)" : ""}
                  </span>
                ))
              )}
              {g.gondnokok.map((gd) => (
                <span key={gd.id} className="badge-sm">
                  Gondnok: {gd.nev}
                </span>
              ))}
              {g.presbiterek.map((p) => (
                <span key={p.id} className="badge-sm">
                  Presbiter: {p.nev}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeruletRow({ kerulet, onChanged, canEdit }: { kerulet: Kerulet; onChanged: () => void; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [nev, setNev] = useState(kerulet.nev);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/keruletek/${kerulet.id}`, { nev });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="row">
        <input value={nev} onChange={(e) => setNev(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={save}>
          Mentés
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Mégse
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span>{kerulet.nev}</span>
      {canEdit && (
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
          Szerkesztés
        </button>
      )}
    </div>
  );
}

function NewKeruletForm({ onCreated }: { onCreated: () => void }) {
  const [nev, setNev] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/keruletek", { nev });
      setNev("");
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <input required value={nev} onChange={(e) => setNev(e.target.value)} placeholder="Új egyházkerület neve" style={{ flex: 1 }} />
      <button className="btn btn-secondary" type="submit">
        Hozzáadás
      </button>
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
    </form>
  );
}

function EgyhazmegyeRow({
  egyhazmegye,
  keruletek,
  onChanged,
  canEdit,
}: {
  egyhazmegye: Egyhazmegye;
  keruletek: Kerulet[];
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [nev, setNev] = useState(egyhazmegye.nev);
  const [keruletId, setKeruletId] = useState(egyhazmegye.keruletId);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/egyhazmegyek/${egyhazmegye.id}`, { nev, keruletId });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="row">
        <input value={nev} onChange={(e) => setNev(e.target.value)} style={{ flex: 1 }} />
        <select value={keruletId} onChange={(e) => setKeruletId(e.target.value)}>
          {keruletek.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nev}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={save}>
          Mentés
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Mégse
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span>
        {egyhazmegye.nev} <span style={{ color: "var(--color-text-muted)" }}>— {egyhazmegye.kerulet.nev}</span>
      </span>
      {canEdit && (
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
          Szerkesztés
        </button>
      )}
    </div>
  );
}

function NewEgyhazmegyeForm({ keruletek, onCreated }: { keruletek: Kerulet[]; onCreated: () => void }) {
  const [nev, setNev] = useState("");
  const [keruletId, setKeruletId] = useState(keruletek[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!keruletId && keruletek.length > 0) setKeruletId(keruletek[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keruletek]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!keruletId) {
      setError("Előbb hozzon létre legalább egy egyházkerületet");
      return;
    }
    try {
      await api.post("/api/egyhazmegyek", { nev, keruletId });
      setNev("");
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <input required value={nev} onChange={(e) => setNev(e.target.value)} placeholder="Új egyházmegye neve" style={{ flex: 1 }} />
      <select value={keruletId} onChange={(e) => setKeruletId(e.target.value)}>
        {keruletek.map((k) => (
          <option key={k.id} value={k.id}>
            {k.nev}
          </option>
        ))}
      </select>
      <button className="btn btn-secondary" type="submit">
        Hozzáadás
      </button>
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
    </form>
  );
}
