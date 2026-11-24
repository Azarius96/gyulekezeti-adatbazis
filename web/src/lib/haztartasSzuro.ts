/** A háztartások listájának kliensoldali szűrői és rendezései (a már betöltött listán, azonnal). Tiszta függvények, kézzel is tesztelhetők. */

export type Rendezes = "cim" | "legidosebb" | "legfiatalabb" | "tagok" | "nev";

export const RENDEZESEK: { id: Rendezes; cimke: string }[] = [
  { id: "cim", cimke: "Cím szerint (alap)" },
  { id: "legidosebb", cimke: "Legidősebb tag szerint (idősebb elöl)" },
  { id: "legfiatalabb", cimke: "Legfiatalabb tag szerint (fiatalabb elöl)" },
  { id: "tagok", cimke: "Létszám szerint (nagyobb család elöl)" },
  { id: "nev", cimke: "Név szerint (ABC)" },
];

export interface SzuroBeallitas {
  rendez: Rendezes;
  /** csak a kiskorú (18 év alatti) személyek / csak a 18 éves és idősebbek */
  kisk: "" | "van" | "nincs";
  /** csak a 70 éves vagy idősebb személyek */
  idos: "" | "van";
  /** a személy családi állapota */
  csall: string;
  /** a személy vallása (pontos egyezés) */
  vallas: string;
  /** csak azok a személyek, akiknek hiányzik a születési dátuma */
  hiany: "" | "van";
}

export const URES_SZURO: SzuroBeallitas = { rendez: "cim", kisk: "", idos: "", csall: "", vallas: "", hiany: "" };

export interface SzuroTag {
  vezeteknev: string;
  keresztnev: string;
  szuletesiDatum: string | null;
  elhunyt: boolean;
  csaladiAllapot?: string | null;
  vallas?: string | null;
}
export interface SzuroHaztartas<T extends SzuroTag = SzuroTag> {
  nev: string | null;
  vallasTipus: string;
  address: { utca: string; hazszam: string };
  tagok: T[];
}

const elok = <T extends SzuroTag>(h: SzuroHaztartas<T>) => h.tagok.filter((t) => !t.elhunyt);

/** A háztartás legidősebb / legfiatalabb élő tagja (a születési dátummal rendelkezők közül). */
export function legidosebbTag<T extends SzuroTag>(h: SzuroHaztartas<T>): T | null {
  const d = elok(h).filter((t) => t.szuletesiDatum);
  return d.length ? d.reduce((a, b) => (a.szuletesiDatum! <= b.szuletesiDatum! ? a : b)) : null;
}
export function legfiatalabbTag<T extends SzuroTag>(h: SzuroHaztartas<T>): T | null {
  const d = elok(h).filter((t) => t.szuletesiDatum);
  return d.length ? d.reduce((a, b) => (a.szuletesiDatum! >= b.szuletesiDatum! ? a : b)) : null;
}

/** Egy SZEMÉLY megfelel-e a (személy szintű) szűrőknek. */
export function szemelyMegfelel<T extends SzuroTag>(t: T, s: SzuroBeallitas, kor: (t: T) => number | null): boolean {
  const k = kor(t);
  if (s.kisk === "van" && !(k !== null && k < 18)) return false;
  if (s.kisk === "nincs" && !(k !== null && k >= 18)) return false;
  if (s.idos === "van" && !(k !== null && k >= 70)) return false;
  if (s.csall && t.csaladiAllapot !== s.csall) return false;
  if (s.vallas && (t.vallas ?? "").trim().toLowerCase() !== s.vallas.trim().toLowerCase()) return false;
  if (s.hiany === "van" && t.szuletesiDatum) return false;
  return true;
}

const aktivSzemelySzuro = (s: SzuroBeallitas) => !!(s.kisk || s.idos || s.csall || s.vallas || s.hiany);

function cimSorrend<T extends SzuroTag>(a: SzuroHaztartas<T>, b: SzuroHaztartas<T>): number {
  const u = a.address.utca.localeCompare(b.address.utca, "hu");
  if (u !== 0) return u;
  const x = parseInt(a.address.hazszam, 10);
  const y = parseInt(b.address.hazszam, 10);
  if (!Number.isNaN(x) && !Number.isNaN(y) && x !== y) return x - y;
  return a.address.hazszam.localeCompare(b.address.hazszam, "hu");
}

export function szurRendez<T extends SzuroTag, H extends SzuroHaztartas<T>>(lista: H[], s: SzuroBeallitas, kor: (t: T) => number | null): H[] {
  // Személy szintű szűrés: a háztartásnál csak a megfelelő SZEMÉLYEK maradnak; akinek senkije sem felel meg, kimarad.
  const szurt: H[] = aktivSzemelySzuro(s)
    ? lista.map((h) => ({ ...h, tagok: h.tagok.filter((t) => !t.elhunyt && szemelyMegfelel(t, s, kor)) })).filter((h) => h.tagok.length > 0)
    : lista;
  const nevKulcs = (h: H) => h.nev ?? (h.tagok[0] ? `${h.tagok[0].vezeteknev} ${h.tagok[0].keresztnev}` : "");
  const rendezo: Record<Rendezes, (a: H, b: H) => number> = {
    cim: cimSorrend,
    legidosebb: (a, b) => {
      const x = legidosebbTag(a)?.szuletesiDatum ?? "9999";
      const y = legidosebbTag(b)?.szuletesiDatum ?? "9999";
      return x === y ? cimSorrend(a, b) : x < y ? -1 : 1;
    },
    legfiatalabb: (a, b) => {
      const x = legfiatalabbTag(a)?.szuletesiDatum ?? "0000";
      const y = legfiatalabbTag(b)?.szuletesiDatum ?? "0000";
      return x === y ? cimSorrend(a, b) : x > y ? -1 : 1;
    },
    tagok: (a, b) => elok(b).length - elok(a).length || cimSorrend(a, b),
    nev: (a, b) => nevKulcs(a).localeCompare(nevKulcs(b), "hu") || cimSorrend(a, b),
  };
  return [...szurt].sort(rendezo[s.rendez]);
}

/**
 * Személy-rangsor: a háztartásokon átívelően, a legidősebb (vagy legfiatalabb) élő személytől kezdve, a születési dátum szerint
 * csökkenő (növekvő) sorrendben. Akinek nincs születési dátuma, kimarad (a hívó külön jelezheti a darabszámot).
 */
export function szemelyRangsor<T extends SzuroTag, H extends SzuroHaztartas<T>>(lista: H[], idosebbElol: boolean): { tag: T; haztartas: H }[] {
  const sorok: { tag: T; haztartas: H }[] = [];
  for (const h of lista) for (const t of h.tagok) if (!t.elhunyt && t.szuletesiDatum) sorok.push({ tag: t, haztartas: h });
  return sorok.sort((a, b) => {
    const x = a.tag.szuletesiDatum!;
    const y = b.tag.szuletesiDatum!;
    if (x !== y) return idosebbElol ? (x < y ? -1 : 1) : x > y ? -1 : 1;
    return `${a.tag.vezeteknev} ${a.tag.keresztnev}`.localeCompare(`${b.tag.vezeteknev} ${b.tag.keresztnev}`, "hu");
  });
}
