import { prisma } from "../lib/prisma.js";
import { ageOn } from "../lib/age.js";

/**
 * Ha valaki elhalálozik, a vele aktív (le nem zárt) házasságban álló házastársát
 * automatikusan özvegy státuszba állítja, és lezárja a házasságot elhalálozás okkal.
 */
export async function applyWidowhoodCascade(personId: string, deathDate: Date | null): Promise<void> {
  const activeMarriages = await prisma.marriage.findMany({
    where: { OR: [{ spouseAId: personId }, { spouseBId: personId }], vege: null },
  });
  for (const m of activeMarriages) {
    await prisma.marriage.update({
      where: { id: m.id },
      data: { vege: deathDate ?? new Date(), vegeOka: "HALALOZAS" },
    });
    const spouseId = m.spouseAId === personId ? m.spouseBId : m.spouseAId;
    if (spouseId) {
      await prisma.person.update({ where: { id: spouseId }, data: { csaladiAllapot: "OZVEGY" } });
    }
  }
}

/**
 * Elhalálozás (vagy temetés rögzítése) esetén a személy még nyitott tisztségei lezárulnak - egy elhunythoz
 * nem tartozhat tisztség. A lezárás napja a halál napja (ha ismert), különben a mai nap.
 */
export async function endPositionsOnDeath(personId: string, deathDate: Date | null): Promise<void> {
  await prisma.position.updateMany({ where: { personId, vege: null }, data: { vege: deathDate ?? new Date() } });
}

type Nem = "FERFI" | "NO";

export interface FamilyOverview {
  szulok: { id: string; vezeteknev: string; keresztnev: string; nem: Nem; linkId: string }[];
  /** A szülők szülei (a szülő-gyermek kapcsolatokból számítva); `ag`: melyik szülőn keresztül (apai / anyai). */
  nagyszulok: { id: string; vezeteknev: string; keresztnev: string; nem: Nem; ag: "apai" | "anyai" }[];
  gyermekek: { id: string; vezeteknev: string; keresztnev: string; nem: Nem; linkId: string }[];
  /** A gyermekek gyermekei (számítva); `szuloje`: melyik gyermekén keresztül unoka. */
  unokak: { id: string; vezeteknev: string; keresztnev: string; nem: Nem; szuloje: string }[];
  hazastarsak: {
    id: string | null;
    vezeteknev: string;
    keresztnev: string;
    datuma: Date | null;
    helye: string | null;
    kulso: boolean;
    marriageId: string;
    vege: Date | null;
  }[];
  testverek: { id: string; vezeteknev: string; keresztnev: string; nem: Nem }[];
}

const personSelect = { id: true, vezeteknev: true, keresztnev: true, nem: true } as const;

export async function getFamilyOverview(personId: string): Promise<FamilyOverview> {
  const parentLinks = await prisma.familyLink.findMany({
    where: { childId: personId },
    include: { parent: { select: personSelect } },
  });
  const szulok = parentLinks.map((l) => ({ ...l.parent, linkId: l.id }));
  const szuloIds = szulok.map((s) => s.id);

  const grandparentLinks = szuloIds.length
    ? await prisma.familyLink.findMany({
        where: { childId: { in: szuloIds } },
        include: { parent: { select: personSelect } },
      })
    : [];
  // Nagyszülő = a szülő szülője (apai, ha az apán, anyai, ha az anyán keresztül); ugyanaz a személy csak egyszer szerepel
  const nagyszuloMap = new Map<string, FamilyOverview["nagyszulok"][number]>();
  for (const l of grandparentLinks) {
    if (nagyszuloMap.has(l.parent.id)) continue;
    const szulo = szulok.find((s) => s.id === l.childId);
    nagyszuloMap.set(l.parent.id, { ...l.parent, ag: szulo?.nem === "FERFI" ? "apai" : "anyai" });
  }
  const nagyszulok = Array.from(nagyszuloMap.values());

  const childLinks = await prisma.familyLink.findMany({
    where: { parentId: personId },
    include: { child: { select: personSelect } },
  });
  const gyermekek = childLinks.map((l) => ({ ...l.child, linkId: l.id }));
  const gyermekIds = gyermekek.map((g) => g.id);

  const grandchildLinks = gyermekIds.length
    ? await prisma.familyLink.findMany({
        where: { parentId: { in: gyermekIds } },
        include: { child: { select: personSelect } },
      })
    : [];
  // Unoka = a gyermek gyermeke; ugyanaz a személy csak egyszer szerepel
  const unokaMap = new Map<string, FamilyOverview["unokak"][number]>();
  for (const l of grandchildLinks) {
    if (unokaMap.has(l.child.id)) continue;
    const gyermek = gyermekek.find((g) => g.id === l.parentId);
    unokaMap.set(l.child.id, { ...l.child, szuloje: gyermek ? `${gyermek.vezeteknev} ${gyermek.keresztnev}` : "" });
  }
  const unokak = Array.from(unokaMap.values());

  const marriages = await prisma.marriage.findMany({
    where: { OR: [{ spouseAId: personId }, { spouseBId: personId }] },
    include: {
      spouseA: { select: personSelect },
      spouseB: { select: personSelect },
    },
  });
  const hazastarsak = marriages.map((m) => {
    const spouse = m.spouseAId === personId ? m.spouseB : m.spouseA;
    if (!spouse) {
      return {
        id: null,
        vezeteknev: m.kulsoHazastarsNeve ?? "Ismeretlen",
        keresztnev: "(nem gyülekezeti tag)",
        datuma: m.datuma,
        helye: m.helye,
        kulso: true,
        marriageId: m.id,
        vege: m.vege,
      };
    }
    return { ...spouse, datuma: m.datuma, helye: m.helye, kulso: false, marriageId: m.id, vege: m.vege };
  });

  const testverekRaw = szuloIds.length
    ? await prisma.familyLink.findMany({
        where: { parentId: { in: szuloIds }, childId: { not: personId } },
        include: { child: { select: personSelect } },
      })
    : [];
  const testverMap = new Map(testverekRaw.map((l) => [l.child.id, l.child]));
  const testverek = Array.from(testverMap.values());

  return { szulok, nagyszulok, gyermekek, unokak, hazastarsak, testverek };
}

// ---------- Háztartási szerep automatikus felismerése ----------

export type HaztartasiSzerepKod = "CSALADFO" | "HAZASTARS" | "GYERMEK" | "EGYEB";

export interface SzerepJavaslat {
  /** null, ha a rendszer nem tudja biztosan megállapítani - ilyenkor rá kell kérdezni. */
  szerep: HaztartasiSzerepKod | null;
  indok: string;
  /** A háztartás jelenlegi (élő) tagjai - a kérdéshez, hogy lássa a felhasználó, kivel kerül egy családba. */
  tagok: { id: string; nev: string; szerep: string; nem: "FERFI" | "NO"; kor: number | null }[];
}

/** A korkülönbség (év), amitől a rendszer "szülő-gyermek" viszonyt feltételez a családfő és az új tag között. */
const GYERMEK_MIN_KORKULONBSEG = 16;
const GYERMEK_MAX_KORKULONBSEG = 38;

/**
 * Megállapítja, mi legyen egy személy szerepe egy háztartásban (családfő = apa/anya, házastárs, gyermek, egyéb).
 * Sorrend: (1) üres háztartás - családfő; (2) rögzített kapcsolatok (szülő-gyermek, aktív házasság);
 * (3) kor és nem alapján: kiskorú vagy a családfőnél 16-38 évvel fiatalabb - gyermek; a családfőhöz hasonló korú,
 * ellenkező nemű, ha még nincs házastárs - házastárs. Minden más esetben (pl. nincs születési dátum, szülő/nagyszülő,
 * egyező nem) a szerep nem állapítható meg biztosan - ilyenkor null, és a felületnek rá kell kérdeznie.
 */
export async function javasoltHaztartasiSzerep(personId: string, householdId: string): Promise<SzerepJavaslat> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { nem: true, szuletesiDatum: true } });
  const most = new Date();
  const tagsagok = await prisma.householdMember.findMany({
    where: { householdId, vege: null, personId: { not: personId }, person: { deletedAt: null } },
    include: { person: { select: { id: true, vezeteknev: true, keresztnev: true, nem: true, szuletesiDatum: true, elhunyt: true } } },
  });
  const elok = tagsagok.filter((m) => !m.person.elhunyt);
  const tagok = elok.map((m) => ({
    id: m.person.id,
    nev: `${m.person.vezeteknev} ${m.person.keresztnev}`,
    szerep: m.szerep as string,
    nem: m.person.nem as "FERFI" | "NO",
    kor: m.person.szuletesiDatum ? ageOn(m.person.szuletesiDatum, most) : null,
  }));
  if (!person) return { szerep: null, indok: "A személy nem található", tagok };
  if (elok.length === 0) return { szerep: "CSALADFO", indok: "Ő az első (egyetlen) tag a háztartásban", tagok };

  const ids = elok.map((m) => m.personId);
  const csaladfo = elok.find((m) => m.szerep === "CSALADFO") ?? null;
  const [szuloi, gyermeki, hazassagok] = await Promise.all([
    prisma.familyLink.findMany({ where: { childId: personId, parentId: { in: ids } } }),
    prisma.familyLink.findMany({ where: { parentId: personId, childId: { in: ids } } }),
    prisma.marriage.findMany({
      where: { vege: null, OR: [{ spouseAId: personId, spouseBId: { in: ids } }, { spouseBId: personId, spouseAId: { in: ids } }] },
    }),
  ]);

  // (2) rögzített kapcsolatok
  if (szuloi.length > 0) return { szerep: "GYERMEK", indok: "A háztartás egyik tagjának gyermeke (rögzített kapcsolat)", tagok };
  const hazastarsId = hazassagok.map((h) => (h.spouseAId === personId ? h.spouseBId : h.spouseAId)).find((x) => x && ids.includes(x));
  if (hazastarsId) {
    if (csaladfo?.personId === hazastarsId) return { szerep: "HAZASTARS", indok: "A család fejének házastársa (rögzített házasság)", tagok };
    if (!csaladfo) return { szerep: "CSALADFO", indok: "A háztartásban házastársával él, a család feje még nincs rögzítve", tagok };
  }
  if (gyermeki.length > 0) {
    if (!csaladfo) return { szerep: "CSALADFO", indok: "A háztartás tagjának szülője, a család feje még nincs rögzítve", tagok };
    if (!gyermeki.some((g) => g.childId === csaladfo.personId)) {
      return { szerep: "HAZASTARS", indok: "A család fejének gyermekéhez tartozó másik szülő", tagok };
    }
    return { szerep: null, indok: "A család fejének szülője - nem egyértelmű (szülő/nagyszülő)", tagok };
  }

  // (3) kor és nem alapján
  const kor = person.szuletesiDatum ? ageOn(person.szuletesiDatum, most) : null;
  if (kor !== null && kor < 18) return { szerep: "GYERMEK", indok: `Kiskorú (${kor} éves)`, tagok };
  const fej = csaladfo?.person ?? [...elok].filter((m) => m.person.szuletesiDatum).sort((a, b) => a.person.szuletesiDatum!.getTime() - b.person.szuletesiDatum!.getTime())[0]?.person ?? null;
  const fejKor = fej?.szuletesiDatum ? ageOn(fej.szuletesiDatum, most) : null;
  if (kor === null || fejKor === null || !fej) return { szerep: null, indok: "Nincs születési dátum a megállapításhoz", tagok };

  const kulonbseg = fejKor - kor; // pozitív: az új tag fiatalabb a családfőnél
  if (kulonbseg >= GYERMEK_MIN_KORKULONBSEG && kulonbseg <= GYERMEK_MAX_KORKULONBSEG) {
    return { szerep: "GYERMEK", indok: `A család fejénél ${kulonbseg} évvel fiatalabb`, tagok };
  }
  const vanHazastars = elok.some((m) => m.szerep === "HAZASTARS");
  if (Math.abs(kulonbseg) < GYERMEK_MIN_KORKULONBSEG && fej.nem !== person.nem && !vanHazastars) {
    return { szerep: "HAZASTARS", indok: "A család fejével hasonló korú, ellenkező nemű, és még nincs másik szülő rögzítve", tagok };
  }
  return { szerep: null, indok: "A kapcsolat a család fejével nem állapítható meg biztosan", tagok };
}

// ---------- Háztartási szerepekből szülő-gyermek kapcsolatok ----------

/** A szülő és a gyermek közötti elfogadható korkülönbség (év): anyánál 16-47, apánál 16-50. Ezen kívül (pl. nagyszülő-unoka) nem hozunk létre kapcsolatot. */
const SZULO_MIN_KORKULONBSEG = 16;
const ANYA_MAX_KORKULONBSEG = 47;
const APA_MAX_KORKULONBSEG = 50;

/**
 * A háztartás szerepeiből (apa/anya = családfő és házastárs, gyerek) létrehozza a hiányzó szülő-gyermek kapcsolatokat:
 * a "gyerek" szerepű tag szülője lesz a háztartás "apa/anya" szerepű (élő) tagja - DE csak akkor, ha mindkettőjük
 * születési dátuma ismert, és a korkülönbség elfogadható (a "gyerek" szerep unokát is jelölhet, ezért nagyszülő-unoka párt
 * soha nem kötünk össze). Meglévő kapcsolatot nem módosít és nem töröl. Amit nem tud biztosan megállapítani, a `kihagyva`
 * listában adja vissza, indoklással - ezeket a felhasználó a személy lapján kézzel rögzítheti.
 */
export async function kapcsolatokHaztartasbol(householdId: string): Promise<{ letrehozva: number; kihagyva: string[] }> {
  const tagok = await prisma.householdMember.findMany({
    where: { householdId, vege: null, person: { deletedAt: null } },
    include: { person: { select: { id: true, vezeteknev: true, keresztnev: true, nem: true, szuletesiDatum: true, elhunyt: true, elkoltozott: true } } },
  });
  const elok = tagok.filter((m) => !m.person.elkoltozott);
  const szulok = elok.filter((m) => (m.szerep === "CSALADFO" || m.szerep === "HAZASTARS") && !m.person.elhunyt);
  const gyerekek = elok.filter((m) => m.szerep === "GYERMEK");
  if (szulok.length === 0 || gyerekek.length === 0) return { letrehozva: 0, kihagyva: [] };

  const meglevo = await prisma.familyLink.findMany({
    where: { parentId: { in: szulok.map((s) => s.personId) }, childId: { in: gyerekek.map((g) => g.personId) } },
    select: { parentId: true, childId: true },
  });
  const van = new Set(meglevo.map((l) => `${l.parentId}:${l.childId}`));
  let letrehozva = 0;
  const kihagyva: string[] = [];
  for (const sz of szulok) {
    for (const gy of gyerekek) {
      if (sz.personId === gy.personId || van.has(`${sz.personId}:${gy.personId}`)) continue;
      const szd = sz.person.szuletesiDatum;
      const gyd = gy.person.szuletesiDatum;
      const nevPar = `${sz.person.vezeteknev} ${sz.person.keresztnev} → ${gy.person.vezeteknev} ${gy.person.keresztnev}`;
      if (!szd || !gyd) {
        kihagyva.push(`${nevPar} (nincs születési dátum)`);
        continue;
      }
      const kulonbseg = (gyd.getTime() - szd.getTime()) / (365.25 * 24 * 3600 * 1000);
      const maxKulonbseg = sz.person.nem === "NO" ? ANYA_MAX_KORKULONBSEG : APA_MAX_KORKULONBSEG;
      if (kulonbseg < SZULO_MIN_KORKULONBSEG || kulonbseg > maxKulonbseg) {
        kihagyva.push(`${nevPar} (${Math.round(kulonbseg)} év korkülönbség - valószínűleg nagyszülő vagy más rokon)`);
        continue;
      }
      await prisma.familyLink.create({ data: { parentId: sz.personId, childId: gy.personId } });
      letrehozva++;
    }
  }
  return { letrehozva, kihagyva };
}
