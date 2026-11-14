export type HaztartasiSzerep = "CSALADFO" | "HAZASTARS" | "GYERMEK" | "EGYEB";

export interface SzerepKerdesAdat {
  indok: string;
  tagok: { id: string; nev: string; szerep: string; kor: number | null }[];
}

const szerepNevek: Record<string, string> = {
  CSALADFO: "családfő",
  HAZASTARS: "házastárs",
  GYERMEK: "gyermek",
  EGYEB: "egyéb",
};

const valasztasok: { kod: HaztartasiSzerep; felirat: string; segedszoveg: string }[] = [
  { kod: "CSALADFO", felirat: "Családfő", segedszoveg: "apa / anya" },
  { kod: "HAZASTARS", felirat: "Házastárs", segedszoveg: "férj / feleség" },
  { kod: "GYERMEK", felirat: "Gyermek", segedszoveg: "fia / lánya" },
  { kod: "EGYEB", felirat: "Egyéb", segedszoveg: "szülő, nagyszülő, rokon" },
];

/** Ha a rendszer nem tudja megállapítani, mi az új tag szerepe a háztartásban (apa, anya, gyermek...), ezzel kérdezünk rá. */
export function SzerepKerdes({
  nev,
  adat,
  foglalt,
  onChoose,
  onSkip,
  skipFelirat,
}: {
  nev: string;
  adat: SzerepKerdesAdat;
  foglalt: boolean;
  onChoose: (szerep: HaztartasiSzerep) => void;
  onSkip: () => void;
  skipFelirat: string;
}) {
  return (
    <div
      className="stack"
      style={{ gap: 12, padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-accent-light)", border: "1.5px solid var(--color-accent)" }}
    >
      <strong>Mi {nev} szerepe ebben a családban?</strong>
      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        A rendszer nem tudta biztosan megállapítani ({adat.indok}). A háztartás jelenlegi tagjai:{" "}
        {adat.tagok.map((t) => `${t.nev} (${szerepNevek[t.szerep] ?? t.szerep}${t.kor !== null ? `, ${t.kor} éves` : ""})`).join("; ")}.
      </span>
      <div className="row">
        {valasztasok.map((v) => (
          <button key={v.kod} type="button" className="btn btn-secondary" disabled={foglalt} onClick={() => onChoose(v.kod)} title={v.segedszoveg}>
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
