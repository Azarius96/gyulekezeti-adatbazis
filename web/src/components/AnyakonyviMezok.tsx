import { DateInput } from "./DateInput";

/**
 * A papír anyakönyvek (keresztelési, konfirmációs, házassági, halotti) bejegyzéseinek mezői.
 * Egy helyen vannak definiálva, így ugyanazok a mezők jelennek meg az új személy felvételekor, a szerkesztésnél
 * és az adatlap olvasó nézetében.
 */
export interface MezoDef {
  kulcs: string;
  felirat: string;
  tipus?: "szoveg" | "datum" | "szam" | "hosszu";
  /** Az űrlapsoron belüli szélesség (px, minimum) - nincs megadva: rugalmas */
  szelesseg?: number;
  placeholder?: string;
}

export const KERESZTELES_MEZOK: MezoDef[] = [
  { kulcs: "datuma", felirat: "Keresztelés ideje", tipus: "datum", szelesseg: 170 },
  { kulcs: "anyakonyviSzam", felirat: "Anyakönyvi sorszám", szelesseg: 150 },
  { kulcs: "anyakonyviEv", felirat: "Anyakönyv éve", tipus: "szam", szelesseg: 120 },
  { kulcs: "lapszam", felirat: "Lapszám", szelesseg: 110 },
  { kulcs: "helye", felirat: "Keresztelés helye" },
  { kulcs: "lelkeszNeve", felirat: "Keresztelő lelkész" },
  { kulcs: "torvenyes", felirat: "Törvényes / törvénytelen", szelesseg: 180 },
  { kulcs: "szuloApaNev", felirat: "Apa neve" },
  { kulcs: "szuloAnyaNev", felirat: "Anya neve" },
  { kulcs: "szulokVallasa", felirat: "Szülők vallása", szelesseg: 150 },
  { kulcs: "szulokFoglalkozasa", felirat: "Szülők foglalkozása" },
  { kulcs: "szulokLakhelye", felirat: "Szülők lakhelye (cím)" },
  { kulcs: "keresztszulok", felirat: "Keresztszülők (neve, lakhelye, foglalkozása)", tipus: "hosszu" },
  { kulcs: "allamiAnyakonyviSzam", felirat: "Állami anyakönyvi szám", szelesseg: 180 },
  { kulcs: "csaladkonyviSzam", felirat: "Családkönyvi szám", szelesseg: 160 },
  { kulcs: "jegyzet", felirat: "Jegyzet", tipus: "hosszu" },
];

export const KONFIRMACIO_MEZOK: MezoDef[] = [
  { kulcs: "datuma", felirat: "Konfirmálás ideje", tipus: "datum", szelesseg: 170 },
  { kulcs: "anyakonyviSzam", felirat: "Folyószám", szelesseg: 130 },
  { kulcs: "lapszam", felirat: "Lapszám", szelesseg: 110 },
  { kulcs: "helye", felirat: "Konfirmálás helye" },
  { kulcs: "lelkeszNeve", felirat: "Konfirmáló lelkész" },
  { kulcs: "szuloApaNev", felirat: "Apa neve" },
  { kulcs: "szuloAnyaNev", felirat: "Anya neve" },
  { kulcs: "szulokVallasa", felirat: "Szülők vallása", szelesseg: 150 },
  { kulcs: "szulokFoglalkozasa", felirat: "Szülők polgári állása / foglalkozása" },
  { kulcs: "keresztelesHelyeIdeje", felirat: "Keresztelés helye és ideje (ahogy az anyakönyvben áll)" },
  { kulcs: "iskolaiVegzettseg", felirat: "Iskolai végzettség", szelesseg: 180 },
  { kulcs: "lakcim", felirat: "Lakcíme" },
  { kulcs: "jegyzet", felirat: "Jegyzet", tipus: "hosszu" },
];

/** A temetési (halotti) anyakönyv mezői - a halál és a temetés ideje a temetés-rögzítő űrlap saját mezői. */
export const HALOTTI_MEZOK: MezoDef[] = [
  { kulcs: "sorszam", felirat: "Halotti anyakönyvi sorszám", szelesseg: 180 },
  { kulcs: "lapszam", felirat: "Lapszám", szelesseg: 110 },
  { kulcs: "halalOka", felirat: "A halál oka" },
  { kulcs: "lakhely", felirat: "Lakása" },
  { kulcs: "szuloHazastarsNeve", felirat: "Szülei, illetve házastársa neve és foglalkozása", tipus: "hosszu" },
  { kulcs: "lelkeszNeve", felirat: "Eltemető lelkész" },
  { kulcs: "csaladkonyviSzam", felirat: "Családkönyvi szám", szelesseg: 160 },
  { kulcs: "jegyzet", felirat: "Jegyzet", tipus: "hosszu" },
];

export type Ertekek = Record<string, string>;

export function uresErtekek(defs: MezoDef[]): Ertekek {
  return Object.fromEntries(defs.map((d) => [d.kulcs, ""]));
}

/** Egy meglévő rekordból (az API válaszából) űrlapértékek: a dátumok "éééé-hh-nn", a hiányzó mezők üresek. */
export function ertekekBol(defs: MezoDef[], rekord: Record<string, unknown> | null | undefined): Ertekek {
  const out: Ertekek = {};
  for (const d of defs) {
    const v = rekord?.[d.kulcs];
    out[d.kulcs] = v === null || v === undefined ? "" : d.tipus === "datum" ? String(v).slice(0, 10) : String(v);
  }
  return out;
}

/** Az űrlapértékekből API-törzs: üres szöveg = null (törlés), a számok számmá alakítva. */
export function torzsBol(defs: MezoDef[], ertekek: Ertekek): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const d of defs) {
    const v = (ertekek[d.kulcs] ?? "").trim();
    out[d.kulcs] = v === "" ? null : d.tipus === "szam" ? Number(v) : v;
  }
  return out;
}

/** Beviteli mezők egy mezőlistához - ugyanaz minden anyakönyvtípusnál. */
export function MezoLista({
  defs,
  ertekek,
  onChange,
  kihagy = [],
}: {
  defs: MezoDef[];
  ertekek: Ertekek;
  onChange: (kovetkezo: Ertekek) => void;
  kihagy?: string[];
}) {
  const beallit = (kulcs: string, v: string) => onChange({ ...ertekek, [kulcs]: v });
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      {defs
        .filter((d) => !kihagy.includes(d.kulcs))
        .map((d) => (
          <div
            key={d.kulcs}
            className="field"
            style={d.tipus === "hosszu" ? { flexBasis: "100%" } : { flex: d.szelesseg ? undefined : 1, width: d.szelesseg, minWidth: d.szelesseg ?? 200 }}
          >
            <label>{d.felirat}</label>
            {d.tipus === "datum" ? (
              <DateInput value={ertekek[d.kulcs] ?? ""} onChange={(e) => beallit(d.kulcs, e.target.value)} />
            ) : d.tipus === "hosszu" ? (
              <textarea rows={2} value={ertekek[d.kulcs] ?? ""} onChange={(e) => beallit(d.kulcs, e.target.value)} placeholder={d.placeholder} />
            ) : (
              <input
                type={d.tipus === "szam" ? "number" : "text"}
                value={ertekek[d.kulcs] ?? ""}
                onChange={(e) => beallit(d.kulcs, e.target.value)}
                placeholder={d.placeholder}
              />
            )}
          </div>
        ))}
    </div>
  );
}

function fmtDatum(v: unknown): string {
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${y}. ${m}. ${d}.` : s;
}

/** Olvasó nézet: a rekord kitöltött mezői felirattal (üres mezőt nem mutat). */
export function AnyakonyviReszletek({ defs, rekord, kihagy = [] }: { defs: MezoDef[]; rekord: Record<string, unknown> | null | undefined; kihagy?: string[] }) {
  if (!rekord) return null;
  const sorok = defs.filter((d) => !kihagy.includes(d.kulcs) && rekord[d.kulcs] !== null && rekord[d.kulcs] !== undefined && String(rekord[d.kulcs]).trim() !== "");
  if (sorok.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "6px 24px" }}>
      {sorok.map((d) => (
        <div key={d.kulcs} style={d.tipus === "hosszu" ? { gridColumn: "1 / -1" } : undefined}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{d.felirat}: </span>
          <strong style={{ fontWeight: 600 }}>{d.tipus === "datum" ? fmtDatum(rekord[d.kulcs]) : String(rekord[d.kulcs])}</strong>
        </div>
      ))}
    </div>
  );
}
