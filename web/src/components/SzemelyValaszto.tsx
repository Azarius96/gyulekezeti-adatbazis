import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { szemelyNev } from "../lib/nev";

export interface ValasztoSzemely {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  leanykoriNev?: string | null;
  nem?: "FERFI" | "NO";
  szuletesiDatum?: string | null;
  elhunyt?: boolean;
  cim?: string | null;
}

/** A személy háztartásában élő többi tag (a családi kapcsolatok gyors kiválasztásához). */
export function useHaztartasTagjai(personId: string): ValasztoSzemely[] {
  const [tagok, setTagok] = useState<ValasztoSzemely[]>([]);
  useEffect(() => {
    let él = true;
    api
      .get<ValasztoSzemely[]>(`/api/persons/${personId}/haztartas-tagjai`)
      .then((r) => él && setTagok(r))
      .catch(() => él && setTagok([]));
    return () => {
      él = false;
    };
  }, [personId]);
  return tagok;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function cimkeEv(j: ValasztoSzemely): string {
  const ev = j.szuletesiDatum ? ` (${j.szuletesiDatum.slice(0, 4)})` : "";
  return `${szemelyNev(j)}${ev}${j.elhunyt ? " †" : ""}`;
}

/**
 * Személyválasztó görgetés nélkül: elöl a háztartásban élők (egy kattintás), alatta beírással kereshető az összes többi.
 * Ha már van kiválasztott személy, az látszik (× gombbal törölhető). `onChange("")` = nincs kiválasztva.
 */
export function SzemelyValaszto({
  osszes,
  hazi,
  value,
  onChange,
  nem,
  kizar = [],
  tiltott = [],
  placeholder = "vagy kezdd el beírni a nevét…",
}: {
  osszes: ValasztoSzemely[];
  hazi: ValasztoSzemely[];
  value: string;
  onChange: (id: string) => void;
  nem?: "FERFI" | "NO";
  kizar?: string[];
  tiltott?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const kivalasztott = value ? osszes.concat(hazi).find((j) => j.id === value) : undefined;
  const nemOk = (j: ValasztoSzemely) => !nem || !j.nem || j.nem === nem;
  const szabad = (j: ValasztoSzemely) => nemOk(j) && !kizar.includes(j.id) && !tiltott.includes(j.id);

  if (value) {
    return (
      <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
        {kivalasztott ? cimkeEv(kivalasztott) : "kiválasztva"}
        <button
          type="button"
          title="Kiválasztás törlése"
          onClick={() => onChange("")}
          style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", font: "inherit", padding: 0 }}
        >
          ×
        </button>
      </span>
    );
  }

  const haziSzabad = hazi.filter(szabad);
  const szavak = norm(q).split(/\s+/).filter(Boolean);
  const talalatok = szavak.length
    ? osszes
        .filter(szabad)
        .filter((j) => {
          const cimke = norm(`${j.vezeteknev} ${j.keresztnev} ${j.leanykoriNev ?? ""}`);
          return szavak.every((sz) => cimke.includes(sz));
        })
        .slice(0, 8)
    : [];

  return (
    <div className="stack" style={{ gap: 6 }}>
      {haziSzabad.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>A háztartásban élők:</span>
          <div className="row" style={{ gap: 6 }}>
            {haziSzabad.map((j) => (
              <button key={j.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(j.id)}>
                {cimkeEv(j)}
              </button>
            ))}
          </div>
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {talalatok.length > 0 && (
        <div className="stack" style={{ gap: 0, border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
          {talalatok.map((j) => (
            <button
              key={j.id}
              type="button"
              className="esemeny-kicsi"
              onClick={() => {
                onChange(j.id);
                setQ("");
              }}
              style={{ padding: "8px 10px" }}
            >
              {cimkeEv(j)}
              {j.cim ? ` — ${j.cim}` : ""}
            </button>
          ))}
        </div>
      )}
      {szavak.length > 0 && talalatok.length === 0 && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>Nincs találat.</span>}
    </div>
  );
}
