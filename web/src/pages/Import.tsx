import { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { isAdmin, ownGyulekezetIds } from "../lib/types";
import { API_BASE } from "../lib/api";

interface ImportResultBase {
  warnings: string[];
}

interface PersonImportResult extends ImportResultBase {
  letrehozva: number;
  kihagyottDuplikatum: number;
  skippedDuplicates: string[];
}

interface CemeteryImportResult extends ImportResultBase {
  letrehozva: number;
  frissitve: number;
  updated: string[];
}

function ResultPanel({ result }: { result: PersonImportResult | CemeteryImportResult | null }) {
  if (!result) return null;
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Import eredménye</h3>
      <div>Létrehozott új személyek: {result.letrehozva}</div>
      {"kihagyottDuplikatum" in result && (
        <>
          <div>Kihagyott (biztos) duplikátumok: {result.kihagyottDuplikatum}</div>
          {result.skippedDuplicates.map((s, i) => (
            <div key={i} style={{ color: "var(--color-text-muted)" }}>
              {s}
            </div>
          ))}
        </>
      )}
      {"frissitve" in result && (
        <>
          <div>Frissített (elhunytra állított) meglévő személyek: {result.frissitve}</div>
          {result.updated.map((s, i) => (
            <div key={i} style={{ color: "var(--color-text-muted)" }}>
              {s}
            </div>
          ))}
        </>
      )}
      {result.warnings.length > 0 && (
        <div className="stack" style={{ marginTop: 12 }}>
          <strong style={{ color: "var(--color-accent)" }}>Ellenőrizendő figyelmeztetések:</strong>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ color: "var(--color-accent)" }}>
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Import() {
  const { user } = useAuth();
  const gyulekezetek = useGyulekezetek();
  const [selectedId] = useSelectedGyulekezet();
  const gyulekezetId = selectedId || (ownGyulekezetIds(user)[0] ?? "");
  const [personResult, setPersonResult] = useState<PersonImportResult | null>(null);
  const [cemeteryResult, setCemeteryResult] = useState<CemeteryImportResult | null>(null);
  const [uploading, setUploading] = useState<"persons" | "cemetery" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const personFileRef = useRef<HTMLInputElement>(null);
  const cemeteryFileRef = useRef<HTMLInputElement>(null);

  if (!isAdmin(user)) {
    return <p style={{ color: "var(--color-danger)" }}>Ez a funkció csak rendszergazda számára érhető el.</p>;
  }

  const effectiveGyulekezetId = gyulekezetId || gyulekezetek[0]?.id || "";

  function downloadTemplate(kind: "persons" | "cemetery") {
    window.location.href = `${API_BASE}/api/import/${kind === "persons" ? "persons-template" : "cemetery-template"}`;
  }

  async function upload(kind: "persons" | "cemetery") {
    const fileInput = kind === "persons" ? personFileRef.current : cemeteryFileRef.current;
    const file = fileInput?.files?.[0];
    if (!file || !effectiveGyulekezetId) {
      setError("Válasszon gyülekezetet és fájlt a feltöltéshez");
      return;
    }
    setError(null);
    setUploading(kind);
    try {
      const formData = new FormData();
      formData.append("gyulekezetId", effectiveGyulekezetId);
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/import/${kind === "persons" ? "persons" : "cemetery"}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Feltöltés sikertelen");
      const json = await res.json();
      if (kind === "persons") setPersonResult(json);
      else setCemeteryResult(json);
      if (fileInput) fileInput.value = "";
    } catch {
      setError("Nem sikerült feldolgozni a fájlt. Ellenőrizze, hogy a sablon formátumát nem módosította.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Excel import</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Személyek / háztartások</h2>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Töltse le a sablont, töltse ki (egy sor = egy személy), majd töltse fel. A cím alapján a rendszer
          automatikusan összeállítja a háztartásokat. Ha egy név és születési év pontosan megegyezik egy már
          meglévő személlyel, azt a rendszer kihagyja (nem hoz létre duplikátumot); ha csak a név hasonló, új
          személyt hoz létre, de figyelmezteti, hogy ellenőrizze.
        </p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => downloadTemplate("persons")}>
            Sablon letöltése
          </button>
          <input ref={personFileRef} type="file" accept=".xlsx" />
          <button className="btn" disabled={uploading === "persons"} onClick={() => upload("persons")}>
            {uploading === "persons" ? "Feltöltés..." : "Feltöltés"}
          </button>
        </div>
        <ResultPanel result={personResult} />
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Temető / elhunytak</h2>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Ha a névre és születési évre egyértelműen ráillik egy meglévő személy, azt a rendszer automatikusan
          elhunytra állítja (nem hoz létre új rekordot). Ha nincs ilyen egyező személy, új elhunyt rekordot hoz
          létre.
        </p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => downloadTemplate("cemetery")}>
            Sablon letöltése
          </button>
          <input ref={cemeteryFileRef} type="file" accept=".xlsx" />
          <button className="btn" disabled={uploading === "cemetery"} onClick={() => upload("cemetery")}>
            {uploading === "cemetery" ? "Feltöltés..." : "Feltöltés"}
          </button>
        </div>
        <ResultPanel result={cemeteryResult} />
      </div>
    </div>
  );
}
