import { useEffect, useRef, useState } from "react";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { api, API_BASE, ApiError } from "../lib/api";
import { IconHistory, IconDownload, IconTrash, IconUpload } from "../components/icons";
import { useGyulekezetek } from "../components/GyulekezetSelect";

interface BackupMeta {
  filename: string;
  reason: "scheduled" | "manual" | "pre-restore" | "uploaded";
  createdAt: string;
  sizeBytes: number;
}

const reasonLabels: Record<BackupMeta["reason"], string> = {
  scheduled: "Ütemezett (heti)",
  manual: "Kézi",
  "pre-restore": "Visszaállítás előtti",
  uploaded: "Feltöltött",
};

const reasonTone: Record<BackupMeta["reason"], string> = {
  scheduled: "icon-tile--blue",
  manual: "icon-tile--green",
  "pre-restore": "icon-tile--orange",
  uploaded: "icon-tile--purple",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" }) +
    " " + new Date(iso).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

async function uploadFile(path: string, file: File): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? "Hiba történt", res.status);
  }
  return res.json();
}

export function Backups() {
  const [backups, setBackups] = useState<BackupMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .get<BackupMeta[]>("/api/backups")
      .then(setBackups)
      .catch(() => setError("Nem sikerült betölteni a mentések listáját"));
  }

  useEffect(load, []);

  async function createNow() {
    setCreating(true);
    setError(null);
    try {
      await api.post("/api/backups");
      load();
    } catch {
      setError("Nem sikerült mentést készíteni");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile("/api/backups/upload", file);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült feltölteni a mentést");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Biztonsági mentések</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          A rendszer hetente automatikusan mentést készít a teljes adatbázisról. A régebbi mentések
          idővel ritkulnak (30 napon túl hetente egy, 180 napon túl havonta egy marad meg), hogy sose
          teljen túl a tárhely - a "Time Machine"-hez hasonlóan bármelyik megmaradt pillanatképre
          vissza lehet állni.
        </p>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          A "Letöltés" gombbal bármelyik mentés saját gépre menthető - érdemes rendszeresen letölteni
          és félretenni egy másik meghajtóra/felhőbe is, hogy a szerver esetleges meghibásodása esetén
          se csak a szerveren legyen meg az egyetlen másolat. A "Mentés feltöltése" gombbal egy korábban
          letöltött (.dump) fájl bármikor visszatölthető ide, és utána a listából ugyanúgy
          visszaállítható, mint bármelyik szerveren készült mentés.
        </p>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="row" style={{ alignItems: "center", gap: 14 }}>
          <span className="icon-tile icon-tile--indigo">
            <IconHistory style={{ width: 22, height: 22 }} />
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>
            {backups === null ? "Betöltés..." : `${backups.length} elérhető mentés`}
          </span>
        </span>
        <div className="row" style={{ gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".dump" style={{ display: "none" }} onChange={handleUpload} />
          <button className="btn btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <IconUpload style={{ width: 16, height: 16 }} />
            {uploading ? "Feltöltés..." : "Mentés feltöltése"}
          </button>
          <button className="btn btn-secondary" disabled={creating} onClick={createNow}>
            {creating ? "Mentés készítése..." : "Mentés készítése most"}
          </button>
        </div>
      </div>

      {backups && backups.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>Még nincs egyetlen mentés sem.</p>
      )}

      <div className="stack" style={{ gap: 10 }}>
        {backups?.map((b) => (
          <BackupRow key={b.filename} backup={b} onChanged={load} />
        ))}
      </div>

      <GyulekezetenkentiMentes />
    </div>
  );
}

function BackupRow({ backup, onChanged }: { backup: BackupMeta; onChanged: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/backups/${backup.filename}`);
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    try {
      await api.post(`/api/backups/${backup.filename}/restore`);
      setShowRestore(false);
      setConfirmText("");
      onChanged();
    } catch {
      setError("A visszaállítás sikertelen - az adatbázis változatlan maradt");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="row" style={{ alignItems: "center", gap: 14 }}>
          <span className={`icon-tile ${reasonTone[backup.reason]}`} style={{ width: 38, height: 38, borderRadius: 11 }}>
            <IconHistory style={{ width: 18, height: 18 }} />
          </span>
          <span>
            <strong>{formatDateTime(backup.createdAt)}</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
              {reasonLabels[backup.reason]} · {formatSize(backup.sizeBytes)}
            </div>
          </span>
        </span>
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <a
            className="btn btn-secondary btn-sm"
            href={`${API_BASE}/api/backups/${backup.filename}/download`}
            download={backup.filename}
          >
            <IconDownload style={{ width: 16, height: 16 }} />
            Letöltés
          </a>
          {!showRestore && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRestore(true)}>
              Visszaállítás
            </button>
          )}
          {!confirmingDelete ? (
            <button className="btn-icon btn-icon-danger" title="Mentés törlése" onClick={() => setConfirmingDelete(true)}>
              <IconTrash style={{ width: 16, height: 16 }} />
            </button>
          ) : (
            <span className="row" style={{ alignItems: "center" }}>
              <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Törlés..." : "Igen, törlöm"}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmingDelete(false)}>
                Mégse
              </button>
            </span>
          )}
        </div>
      </div>

      {showRestore && (
        <div
          className="stack"
          style={{ gap: 8, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "rgba(255, 69, 58, 0.14)", border: "1px solid var(--color-danger)" }}
        >
          <strong style={{ color: "var(--color-danger)" }}>
            Ez felülírja a jelenlegi teljes adatbázist ezzel a {formatDateTime(backup.createdAt)}-i állapottal.
          </strong>
          <span style={{ fontSize: "var(--font-size-sm)" }}>
            A visszaállítás előtt automatikusan készül egy friss mentés a jelenlegi állapotról, tehát ez a
            lépés is visszavonható. A megerősítéshez írja be: <strong>VISSZAÁLLÍTOM</strong>
          </span>
          <div className="row" style={{ alignItems: "center" }}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="VISSZAÁLLÍTOM"
              style={{ width: 200 }}
            />
            <button
              className="btn btn-danger btn-sm"
              disabled={confirmText !== "VISSZAÁLLÍTOM" || restoring}
              onClick={handleRestore}
            >
              {restoring ? "Visszaállítás..." : "Végleges visszaállítás"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowRestore(false);
                setConfirmText("");
                setError(null);
              }}
            >
              Mégse
            </button>
          </div>
          {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function GyulekezetenkentiMentes() {
  const gyulekezetek = useGyulekezetek();
  const [selectedGyulekezetId] = useSelectedGyulekezet();
  const [gyulekezetId, setGyulekezetId] = useState(selectedGyulekezetId);
  useEffect(() => {
    setGyulekezetId(selectedGyulekezetId);
  }, [selectedGyulekezetId]);
  const [showRestore, setShowRestore] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const gyulekezetNev = gyulekezetek.find((g) => g.id === gyulekezetId)?.nev ?? "";

  function pickFile(file: File | undefined) {
    if (!file) return;
    setPendingFile(file);
    setShowRestore(true);
    setError(null);
    setSuccess(null);
  }

  async function handleRestore() {
    if (!pendingFile || !gyulekezetId) return;
    setRestoring(true);
    setError(null);
    try {
      await uploadFile(`/api/backups/gyulekezet/${gyulekezetId}/restore`, pendingFile);
      setSuccess(`${gyulekezetNev} adatai visszaállítva.`);
      setShowRestore(false);
      setConfirmText("");
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "A visszaállítás sikertelen");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div>
        <strong>Gyülekezetenkénti mentés</strong>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0", fontSize: "var(--font-size-sm)" }}>
          Egy adott gyülekezet teljes adatállománya (személyek, háztartások, egyházfenntartó,
          anyakönyvi események, temető stb.) külön fájlba menthető és külön is visszaállítható -
          anélkül, hogy bármelyik másik gyülekezetet érintené. Visszaállítás előtt itt is
          automatikusan készül egy teljes adatbázis-mentés.
        </p>
      </div>

      <div className="field" style={{ maxWidth: 360 }}>
        <label>Gyülekezet</label>
        <select value={gyulekezetId} onChange={(e) => { setGyulekezetId(e.target.value); setError(null); setSuccess(null); }}>
          <option value="">Válasszon gyülekezetet...</option>
          {gyulekezetek.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nev}
            </option>
          ))}
        </select>
      </div>

      {gyulekezetId && (
        <div className="row" style={{ gap: 8 }}>
          <a className="btn btn-secondary btn-sm" href={`${API_BASE}/api/backups/gyulekezet/${gyulekezetId}/export`}>
            <IconDownload style={{ width: 16, height: 16 }} />
            {gyulekezetNev} mentésének letöltése
          </a>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => pickFile(e.target.files?.[0])} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <IconUpload style={{ width: 16, height: 16 }} />
            Mentés visszaállítása fájlból
          </button>
        </div>
      )}

      {success && <p style={{ color: "var(--color-success, #2a9d5c)", margin: 0 }}>{success}</p>}

      {showRestore && pendingFile && (
        <div
          className="stack"
          style={{ gap: 8, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "rgba(255, 69, 58, 0.14)", border: "1px solid var(--color-danger)" }}
        >
          <strong style={{ color: "var(--color-danger)" }}>
            Ez felülírja a(z) {gyulekezetNev} gyülekezet jelenlegi adatait a "{pendingFile.name}" fájl tartalmával -
            más gyülekezet adatát nem érinti.
          </strong>
          <span style={{ fontSize: "var(--font-size-sm)" }}>
            A mentés óta hozzáadott adatok, amik a fájlban nem szerepelnek, eltávolításra kerülnek (a
            törölhető típusok a papírkosárba, nem véglegesen). A megerősítéshez írja be:{" "}
            <strong>VISSZAÁLLÍTOM</strong>
          </span>
          <div className="row" style={{ alignItems: "center" }}>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="VISSZAÁLLÍTOM" style={{ width: 200 }} />
            <button className="btn btn-danger btn-sm" disabled={confirmText !== "VISSZAÁLLÍTOM" || restoring} onClick={handleRestore}>
              {restoring ? "Visszaállítás..." : "Végleges visszaállítás"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowRestore(false);
                setConfirmText("");
                setPendingFile(null);
                setError(null);
              }}
            >
              Mégse
            </button>
          </div>
          {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
