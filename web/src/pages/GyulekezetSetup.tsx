import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function GyulekezetSetup() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"alap" | "kesz">("alap");
  const [gyulekezetId, setGyulekezetId] = useState<string | null>(null);

  const [nev, setNev] = useState("");
  const [cim, setCim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [duesOsszeg, setDuesOsszeg] = useState("");
  const [duesKorhatarTol, setDuesKorhatarTol] = useState("18");
  const [duesKorhatarIg, setDuesKorhatarIg] = useState("120");
  const [duesSaved, setDuesSaved] = useState(false);

  const [sirOsszeg, setSirOsszeg] = useState("");
  const [sirEv, setSirEv] = useState("25");
  const [sirSaved, setSirSaved] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const g = await api.post<{ id: string }>("/api/gyulekezetek", { nev, publicAddress: cim || null });
      setGyulekezetId(g.id);
      await refresh();
      setStep("kesz");
    } catch {
      setError("Nem sikerült létrehozni a gyülekezetet");
    } finally {
      setSaving(false);
    }
  }

  async function saveDues() {
    if (!gyulekezetId || !duesOsszeg) return;
    await api.post(`/api/gyulekezetek/${gyulekezetId}/dues-config`, {
      korhatarTol: Number(duesKorhatarTol),
      korhatarIg: Number(duesKorhatarIg),
      osszeg: Number(duesOsszeg),
      ervenyesTol: new Date().toISOString().slice(0, 10),
    });
    setDuesSaved(true);
  }

  async function saveSir() {
    if (!gyulekezetId || !sirOsszeg) return;
    await api.post(`/api/gyulekezetek/${gyulekezetId}/grave-price-config`, {
      ervenyessegEv: Number(sirEv),
      osszeg: Number(sirOsszeg),
      ervenyesTol: new Date().toISOString().slice(0, 10),
    });
    setSirSaved(true);
  }

  if (step === "alap") {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: "var(--font-size-xl)" }}>Üdvözöljük! Hozza létre a gyülekezetét</h1>
        <p style={{ color: "var(--color-text-muted)" }}>
          Első belépéskor még nincs gyülekezet hozzárendelve a fiókjához. Adja meg a gyülekezet nevét és címét — utána
          beállíthatja az egyházfenntartó díjat és a sírhelymegváltás díját is, majd hozzáadhatja a gondnokot,
          presbitereket és nőszövetségi tagokat a Háztartások oldalon.
        </p>
        <form onSubmit={handleCreate} className="card stack">
          <div className="field">
            <label>Gyülekezet neve</label>
            <input required value={nev} onChange={(e) => setNev(e.target.value)} placeholder="pl. Búzásbocsárdi Református Egyházközség" />
          </div>
          <div className="field">
            <label>Cím</label>
            <input value={cim} onChange={(e) => setCim(e.target.value)} placeholder="pl. Búzásbocsárd, Fő utca 1." />
          </div>
          {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Létrehozás..." : "Gyülekezet létrehozása"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Gyülekezet létrehozva</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Most beállíthatja az egyházfenntartói díjat és a sírhelymegváltás díját. Ezeket később is módosíthatja.
      </p>

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházfenntartó díj</h2>
        <div className="row">
          <div className="field">
            <label>Kortól</label>
            <input type="number" value={duesKorhatarTol} onChange={(e) => setDuesKorhatarTol(e.target.value)} />
          </div>
          <div className="field">
            <label>Korig</label>
            <input type="number" value={duesKorhatarIg} onChange={(e) => setDuesKorhatarIg(e.target.value)} />
          </div>
          <div className="field">
            <label>Éves összeg (lej)</label>
            <input type="number" value={duesOsszeg} onChange={(e) => setDuesOsszeg(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-secondary" type="button" onClick={saveDues} disabled={!duesOsszeg}>
          {duesSaved ? "Mentve ✓" : "Mentés"}
        </button>
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Sírhelymegváltás díja</h2>
        <div className="row">
          <div className="field">
            <label>Érvényesség (év)</label>
            <input type="number" value={sirEv} onChange={(e) => setSirEv(e.target.value)} />
          </div>
          <div className="field">
            <label>Összeg (lej)</label>
            <input type="number" value={sirOsszeg} onChange={(e) => setSirOsszeg(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-secondary" type="button" onClick={saveSir} disabled={!sirOsszeg}>
          {sirSaved ? "Mentve ✓" : "Mentés"}
        </button>
      </div>

      <button className="btn" onClick={() => navigate("/")}>
        Tovább az áttekintőhöz
      </button>
    </div>
  );
}
