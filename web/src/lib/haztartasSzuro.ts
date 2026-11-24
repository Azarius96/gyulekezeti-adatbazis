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
  /** egyező / vegyes vallású család */
  vtip: "" | "EGYEZO" | "VEGYES";
  /** élő tagok száma: "1" (egyedülálló), "2", "3+", "4+" */
  meret: "" | "1" | "2" | "3+" | "4+";
  /** van-e 18 év alatti tag */
  kisk: "" | "van" | "nincs";
  /** van-e 70 éves vagy idősebb tag */
  idos: "" | "van";
  /** valamelyik tag családi állapota */
  csall: string;
  /** van-e tag, akinek hiányzik a születési dátuma */
  hiany: "" | "van";
}

export const URES_SZURO: SzuroBeallitas = { rendez: "cim", vtip: "", meret: "", kisk: "", idos: "", csall: "", hiany: "" };

export interface SzuroTag {
  vezeteknev: string;
  keresztnev: string;
  szuletesiDatum: string | null;
  elhunyt: boolean;
  csaladiAllapot?: string | null;
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

export function haztartasMegfelel<T extends SzuroTag>(h: SzuroHaztartas<T>, s: SzuroBeallitas, kor: (t: T) => number | null): boolean {
  const e = elok(h);
  if (s.vtip && h.vallasTipus !== s.vtip) return false;
  if (s.meret) {
    const n = e.length;
    if (s.meret === "1" && n !== 1) return false;
    if (s.meret === "2" && n !== 2) return false;
    if (s.meret === "3+" && n < 3) return false;
    if (s.meret === "4+" && n < 4) return false;
  }
  if (s.kisk === "van" && !e.some((t) => (kor(t) ?? 99) < 18)) return false;
  if (s.kisk === "nincs" && e.some((t) => (kor(t) ?? 99) < 18)) return false;
  if (s.idos === "van" && !e.some((t) => (kor(t) ?? -1) >= 70)) return false;
  if (s.csall && !e.some((t) => t.csaladiAllapot === s.csall)) return false;
  if (s.hiany === "van" && !e.some((t) => !t.szuletesiDatum)) return false;
  return true;
}

function cimSorrend<T extends SzuroTag>(a: SzuroHaztartas<T>, b: SzuroHaztartas<T>): number {
  const u = a.address.utca.localeCompare(b.address.utca, "hu");
  if (u !== 0) return u;
  const x = parseInt(a.address.hazszam, 10);
  const y = parseInt(b.address.hazszam, 10);
  if (!Number.isNaN(x) && !Number.isNaN(y) && x !== y) return x - y;
  return a.address.hazszam.localeCompare(b.address.hazszam, "hu");
}

export function szurRendez<T extends SzuroTag, H extends SzuroHaztartas<T>>(lista: H[], s: SzuroBeallitas, kor: (t: T) => number | null): H[] {
  const szurt = lista.filter((h) => haztartasMegfelel(h, s, kor));
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
