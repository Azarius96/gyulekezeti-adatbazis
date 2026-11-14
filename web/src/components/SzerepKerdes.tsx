import { szerepNev } from "../lib/types";

/** A háztartásban tárolt szerep: az apa és az anya is "szülő" (családfő / házastárs). */
export type HaztartasiSzerep = "CSALADFO" | "HAZASTARS" | "GYERMEK" | "EGYEB";

export interface SzerepKerdesAdat {
  indok: string;
  tagok: { id: string; nev: string; szerep: string; nem: "FERFI" | "NO"; kor: number | null }[];
}

/** Ha a rendszer nem tudja megállapítani, mi az új tag szerepe a háztartásban (apa, anya, gyerek...), ezzel kérdezünk rá. */
export function SzerepKerdes({
  nev,
  nem,
  adat,
  foglalt,
  onChoose,
  onSkip,
  skipFelirat,
}: {
  nev: string;
  /** Az új tag neme: az "apa" vagy "anya" gomb ez alapján jelenik meg. */
  nem: "FERFI" | "NO";
  adat: SzerepKerdesAdat;
  foglalt: boolean;
  onChoose: (szerep: HaztartasiSzerep) => void;
  onSkip: () => void;
  skipFelirat: string;
}) {
  // Ha a háztartásban már van "családfő" (az egyik szülő), a másik szülő a "házastárs" szerepet kapja
  const szuloSzerep: HaztartasiSzerep = adat.tagok.some((t) => t.szerep === "CSALADFO") ? "HAZASTARS" : "CSALADFO";
  const szuloFelirat = szerepNev("CSALADFO", nem);
  const valasztasok: { szerep: HaztartasiSzerep; felirat: string; segedszoveg: string }[] = [
    { szerep: szuloSzerep, felirat: szuloFelirat[0].toUpperCase() + szuloFelirat.slice(1), segedszoveg: "a család szülője" },
    { szerep: "GYERMEK", felirat: "Gyerek", segedszoveg: "fia / lánya" },
    { szerep: "EGYEB", felirat: "Egyéb", segedszoveg: "nagyszülő, rokon" },
  ];
  return (
    <div
      className="stack"
      style={{ gap: 12, padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-accent-light)", border: "1.5px solid var(--color-accent)" }}
    >
      <strong>Mi {nev} szerepe ebben a családban?</strong>
      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        A rendszer nem tudta biztosan megállapítani ({adat.indok}). A háztartás jelenlegi tagjai:{" "}
        {adat.tagok.map((t) => `${t.nev} (${szerepNev(t.szerep, t.nem)}${t.kor !== null ? `, ${t.kor} éves` : ""})`).join("; ")}.
      </span>
      <div className="row">
        {valasztasok.map((v) => (
          <button key={v.felirat} type="button" className="btn btn-secondary" disabled={foglalt} onClick={() => onChoose(v.szerep)} title={v.segedszoveg}>
            {v.felirat} <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>({v.segedszoveg})</span>
          </button>
        ))}
        <button type="button" className="btn btn-secondary" disabled={foglalt} onClick={onSkip}>
          {skipFelirat}
        </button>
      </div>
    </div>
  );
}
