import { prisma } from "../lib/prisma.js";
import { ageOn } from "../lib/age.js";

/**
 * EGYHÁZFENNTARTÓI JÁRULÉK - ÉVENKÉNTI SZÁMÍTÁS
 * ================================================
 * Ez a modul számolja ki, hogy egy adott személynek mennyi egyházfenntartót kellett/kell
 * fizetnie egy adott évben, és hogy ez hogyan viszonyul a ténylegesen befizetett összeghez.
 *
 * Alapelvek, amikre minden számítás épül:
 *
 * 1. MINDEN ÉV A SAJÁT (AKKOR ÉRVÉNYES) DÍJSZABÁSÁVAL SZÁMOLÓDIK.
 *    A `ChurchDuesConfig` sorok "generációkba" (korsáv-készletekbe) rendeződnek az
 *    `ervenyesEttolEv` mező alapján. Egy adott évre mindig a legfrissebb olyan generáció
 *    számít, amelynek ervenyesEttolEv értéke még nem későbbi annál az évnél. Enélkül egy
 *    díjemelés visszamenőleg is a régebbi éveket terhelné (pl. ha 2026-tól emelkedik a díj,
 *    egy 2025-re már teljes egészében befizető személy tévesen tartozónak tűnne).
 *
 * 2. HA EGY ÉVRE NINCS ISMERT DÍJSZABÁS, AZT ŐSZINTÉN "NEM ISMERT"-KÉNT KEZELJÜK - nem
 *    becsüljük meg egy másik év díjszabásából, és nem tekintjük automatikusan mentesnek
 *    vagy fizetendőnek sem. A `DuesResult.ismertDijszabas` mező jelzi ezt kifelé.
 *
 * 3. A KOR MINDIG AZ ADOTT ÉV VÉGÉN (december 31.) SZÁMÍT, konzisztensen minden évre
 *    (a folyó évre is) - így a "ma látott" díj mindig megegyezik azzal, amit egy később
 *    lezajló évvégi elszámolás is adna, függetlenül attól, hogy az adott napon még volt-e
 *    a személynek születésnapja.
 *
 * 4. ÁTFEDŐ KORSÁVOK ESETÉN A KEDVEZŐBB (ALACSONYABB ÖSSZEGŰ) SÁV ÉRVÉNYES.
 *    Ha pl. egy "0-21" és egy "21-75" sáv is létezik ugyanabban a generációban, a 21 éves
 *    személy mindkettőbe beleesik - ilyenkor sosem fizethet a magasabb összeget.
 *
 * 5. A "KORÁBBI (NYITÓ) TARTOZÁS" (Person.nyitoTartozas) egy, a rendszer bevezetése előttről
 *    áthozott, évhez nem köthető hátralék (pl. papír-nyilvántartásból). Ez teljesen független
 *    az évenkénti számítástól, sosem szabad összekeverni vele.
 */

export interface DuesBand {
  korhatarTol: number;
  korhatarIg: number;
  osszeg: unknown; // Prisma Decimal
}

export interface DuesResult {
  /** Volt-e egyáltalán rögzített díjszabás erre az évre ennél a gyülekezetnél. */
  ismertDijszabas: boolean;
  /** null, ha a díjszabás nem ismert erre az évre. */
  esedekesOsszeg: number | null;
  mentes: boolean;
  kedvezmenyes: boolean;
  korsav: { korhatarTol: number; korhatarIg: number } | null;
}

const UNKNOWN_DUES: DuesResult = {
  ismertDijszabas: false,
  esedekesOsszeg: null,
  mentes: false,
  kedvezmenyes: false,
  korsav: null,
};

// ---------- Korsáv-készlet lekérdezése ----------

/**
 * Egy gyülekezet adott évben ténylegesen érvényes korsáv-készlete: a legfrissebb generáció
 * (legnagyobb ervenyesEttolEv), amely még nem későbbi, mint a kérdéses év. Üres tömb, ha
 * erre az évre (vagy korábbra) még sosem lett díjszabás rögzítve.
 */
export async function getDuesBandsForYear(gyulekezetId: string, year: number): Promise<DuesBand[]> {
  const all = await prisma.churchDuesConfig.findMany({
    where: { gyulekezetId, ervenyesEttolEv: { lte: year } },
    orderBy: { ervenyesEttolEv: "desc" },
  });
  if (all.length === 0) return [];
  const latestGeneration = all[0].ervenyesEttolEv;
  return all.filter((c) => c.ervenyesEttolEv === latestGeneration);
}

/** Hány évre visszamenőleg (a folyó évvel együtt: évek száma = ennyi + 1) számítjuk a személy-/háztartásnézet tartozását. */
export const TARTOZAS_VISSZAMENO_EVEK = 2;

/** A folyó és az azt megelőző TARTOZAS_VISSZAMENO_EVEK év korsáv-készlete évenként (a computeMemberDuesInfo-hoz). */
export async function loadDuesBandsByYear(gyulekezetId: string): Promise<Map<number, DuesBand[]>> {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: TARTOZAS_VISSZAMENO_EVEK + 1 }, (_, i) => currentYear - TARTOZAS_VISSZAMENO_EVEK + i);
  const entries = await Promise.all(years.map(async (y) => [y, await getDuesBandsForYear(gyulekezetId, y)] as const));
  return new Map(entries);
}

/** A gyülekezet ma (a folyó évben) érvényes korsáv-készlete. */
export function getCurrentDuesBands(gyulekezetId: string): Promise<DuesBand[]> {
  return getDuesBandsForYear(gyulekezetId, new Date().getFullYear());
}

// ---------- Egy korra/évre vonatkozó díj kiszámítása ----------

/**
 * Egy adott életkorra eső díj egy már betöltött korsáv-készletből.
 * `bands` üres tömbje "nincs ismert díjszabás"-t jelent (ismertDijszabas: false).
 * Ha a kor egyetlen sávba sem esik bele (pl. a beállított sávok nem fedik le a teljes
 * skálát), az mentességnek számít - a lelkész által megadott sávok hézagja tudatos döntés.
 */
export function resolveDuesForAge(age: number, bands: DuesBand[]): DuesResult {
  if (bands.length === 0) return UNKNOWN_DUES;

  const matches = bands.filter((b) => age >= b.korhatarTol && age <= b.korhatarIg);
  if (matches.length === 0) {
    return { ismertDijszabas: true, esedekesOsszeg: 0, mentes: true, kedvezmenyes: false, korsav: null };
  }

  const cheapest = matches.reduce((best, b) => (Number(b.osszeg) < Number(best.osszeg) ? b : best));
  const osszeg = Number(cheapest.osszeg);
  const maxOsszeg = bands.reduce((max, b) => Math.max(max, Number(b.osszeg)), 0);

  return {
    ismertDijszabas: true,
    esedekesOsszeg: osszeg,
    mentes: osszeg === 0,
    kedvezmenyes: osszeg > 0 && osszeg < maxOsszeg,
    korsav: { korhatarTol: cheapest.korhatarTol, korhatarIg: cheapest.korhatarIg },
  };
}

/** Egy személy díja egy adott évre, a személy azévi (év végi) életkora alapján. */
export function resolveDuesForYear(szuletesiDatum: Date | null, year: number, bands: DuesBand[]): DuesResult {
  if (!szuletesiDatum) return UNKNOWN_DUES;
  return resolveDuesForAge(ageOn(szuletesiDatum, new Date(year, 11, 31)), bands);
}

/**
 * Ugyanaz, mint `resolveDuesForYear`, de ha a születési dátum nem ismert (pl. egy régi,
 * papíralapú nyilvántartásból átvett taglistánál, ahol soha nem volt rögzítve), a pontos
 * korsáv helyett a sztenderd (legmagasabb) összeget vesszük irányadónak - hogy a hiányzó
 * születési dátum SOHA ne jelentse azt, hogy valaki elvileg sosem tűnhet fel tartozóként.
 * A `becsult: true` jelzi, hogy ez nem a tényleges korsáv szerinti, hanem egy becsült összeg -
 * a felületnek ezt mindig jeleznie kell, hogy a lelkész tudja: érdemes pótolni a születési
 * dátumot a pontos számításhoz.
 */
export function resolveDuesForYearOrEstimate(
  szuletesiDatum: Date | null,
  year: number,
  bands: DuesBand[]
): { dues: DuesResult; becsult: boolean } {
  if (szuletesiDatum) {
    return { dues: resolveDuesForYear(szuletesiDatum, year, bands), becsult: false };
  }
  const standard = bands.reduce((max, b) => Math.max(max, Number(b.osszeg)), 0);
  if (standard <= 0) return { dues: UNKNOWN_DUES, becsult: false };
  return {
    dues: { ismertDijszabas: true, esedekesOsszeg: standard, mentes: false, kedvezmenyes: false, korsav: null },
    becsult: true,
  };
}

// ---------- Több éve elmaradt-e valaki ----------

/**
 * Több éve elmaradt-e a személy az egyházfenntartóval. Igaz, ha:
 *   - van korábbi (nyitó) tartozása a rendszer bevezetése előttről, VAGY
 *   - a folyó évre is fizetendő összeggel tartozik, A TAVALYI ÉVRE IS fizetendő lett volna
 *     (ismert díjszabás szerint), ÉS a tavalyi évre egyáltalán nincs befizetése rögzítve.
 *
 * A tavalyi év ellenőrzése kulcsfontosságú: enélkül egy olyan személy, aki tavaly még a
 * mentességi korhatár alatt volt (pl. 21 éves), de idén már átlépte azt (22 éves), tévesen
 * "elmaradónak" tűnne a tavalyi évre - pedig akkor még nem is kellett fizetnie. Ugyanígy,
 * ha a tavalyi évre nincs ismert díjszabás, nem állítható biztosan, hogy tartozott - ezért
 * ilyenkor sem jelöljük elmaradónak.
 */
export function isMultiYearOverdue(params: {
  elhunyt: boolean;
  nyitoTartozas: number;
  currentDues: DuesResult;
  prevYearDues: DuesResult;
  hasPrevYearPayment: boolean;
}): boolean {
  if (params.elhunyt) return false;
  if (params.nyitoTartozas > 0.01) return true;
  if (!params.currentDues.esedekesOsszeg || params.currentDues.esedekesOsszeg <= 0) return false;
  if (!params.prevYearDues.ismertDijszabas || !params.prevYearDues.esedekesOsszeg || params.prevYearDues.esedekesOsszeg <= 0) {
    return false;
  }
  return !params.hasPrevYearPayment;
}

// ---------- Egy tag teljes "díj-infója" egyben (háztartás/személy nézetekhez) ----------

export interface MemberDuesInfo {
  egyhazfenntarto: DuesResult;
  egyhazfenntartoBecsult: boolean;
  fizetveIdenre: boolean;
  tobbEveElmaradt: boolean;
  /** A nyitó (korábbi) tartozás + a tavalyi és a folyó évből hiányzó összeg lejben - ugyanaz a szám,
   * amit a Pénzügyek / Tartozók lista alapértelmezett (tavalyi-idei) időszaka mutat. */
  tartozasOsszeg: number;
  /** A tartozás évenkénti bontása (csak a ténylegesen hiányzó évek, növekvő sorrendben). A nyitó tartozás ebben nincs benne. */
  tartozasEvek: { ev: number; hianyzo: number; becsult: boolean }[];
}

/**
 * Egyben számolja ki egy tag megjelenítéshez szükséges összes díj-infóját: a folyó évi
 * esedékes összeget, hogy fizetett-e már idén, és hogy több éve elmaradt-e. A hívónak
 * a folyó évi ÉS a tavalyi év korsáv-készletét is át kell adnia (ezek gyakran ugyanaz,
 * de díjemelés esetén eltérhetnek).
 */
export function computeMemberDuesInfo(
  person: {
    szuletesiDatum: Date | null;
    elhunyt: boolean;
    /** Kiköltözött tag: nincs esedékes díja és tartozása (mint az elhunytnak). */
    elkoltozott?: boolean;
    nyitoTartozas: unknown;
    duesPayments: { ev: number; osszeg?: unknown }[];
  },
  bandsByYear: Map<number, DuesBand[]>
): MemberDuesInfo {
  const currentYear = new Date().getFullYear();
  const { dues: egyhazfenntarto, becsult: egyhazfenntartoBecsult } = resolveDuesForYearOrEstimate(
    person.szuletesiDatum,
    currentYear,
    bandsByYear.get(currentYear) ?? []
  );
  const { dues: prevYearDues } = resolveDuesForYearOrEstimate(
    person.szuletesiDatum,
    currentYear - 1,
    bandsByYear.get(currentYear - 1) ?? []
  );
  const fizetveIdenre = person.duesPayments.some((p) => p.ev === currentYear);
  const hasPrevYearPayment = person.duesPayments.some((p) => p.ev === currentYear - 1);

  const tartozasEvek: MemberDuesInfo["tartozasEvek"] = [];
  const inactive = person.elhunyt || !!person.elkoltozott;
  if (!inactive) {
    for (let ev = currentYear - TARTOZAS_VISSZAMENO_EVEK; ev <= currentYear; ev++) {
      const { dues, becsult } = resolveDuesForYearOrEstimate(person.szuletesiDatum, ev, bandsByYear.get(ev) ?? []);
      if (!dues.ismertDijszabas || !dues.esedekesOsszeg || dues.esedekesOsszeg <= 0) continue;
      const paid = person.duesPayments.filter((p) => p.ev === ev).reduce((sum, p) => sum + Number(p.osszeg ?? 0), 0);
      const hianyzo = Math.round((dues.esedekesOsszeg - paid) * 100) / 100;
      if (hianyzo > 0.01) tartozasEvek.push({ ev, hianyzo, becsult });
    }
  }

  // Egy korábbi (nem folyó) évre hiányzó összeg is "elmaradás" - akkor is, ha a tavalyi évre volt valami befizetés.
  const tobbEveElmaradt =
    tartozasEvek.some((e) => e.ev < currentYear) ||
    isMultiYearOverdue({
    elhunyt: inactive,
    nyitoTartozas: Number(person.nyitoTartozas),
    currentDues: egyhazfenntarto,
    prevYearDues,
    hasPrevYearPayment,
  });

  const tartozasOsszeg = inactive
    ? 0
    : Math.round((Number(person.nyitoTartozas) + tartozasEvek.reduce((sum, e) => sum + e.hianyzo, 0)) * 100) / 100;

  return { egyhazfenntarto, egyhazfenntartoBecsult, fizetveIdenre, tobbEveElmaradt, tartozasOsszeg, tartozasEvek };
}
