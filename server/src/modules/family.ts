import { prisma } from "../lib/prisma.js";
import { ageOn } from "../lib/age.js";

/**
 * Ha valaki elhalálozik, a házastársa azonnal özvegy családi állapotú lesz:
 *  - a vele aktív (le nem zárt) házasságban álló házastárs: a házasság lezárul elhalálozás okkal;
 *  - ha nincs rögzített házasság, de a háztartásban ő az apa/anya pár egyik tagja (családfő és házastárs szerep), a másik
 *    szülő lesz özvegy - csak akkor, ha egyértelműen egyetlen ilyen házastársa van, és a családi állapota házas vagy nincs megadva.
 */
export async function applyWidowhoodCascade(personId: string, deathDate: Date | null): Promise<void> {
  await haztartasiHazastarsOzvegy(personId);
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
    anyakonyviSzam: string | null;
    tanuk: string | null;
    kulso: boolean;
    marriageId: string;
    vege: Date | null;
    /** true: nincs rögzített házasság, a házastársi viszony a háztartás szerepeiből (apa + anya) következik. */
    haztartasbol?: boolean;
    masVallasu?: boolean;
  }[];
  testverek: { id: string; vezeteknev: string; keresztnev: string; nem: Nem }[];
}

const personSelect = { id: true, vezeteknev: true, leanykoriNev: true, keresztnev: true, nem: true } as const;

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
  const hazastarsak: FamilyOverview["hazastarsak"] = marriages.map((m) => {
    const spouse = m.spouseAId === personId ? m.spouseB : m.spouseA;
    if (!spouse) {
      return {
        id: null,
        vezeteknev: m.kulsoHazastarsNeve ?? "Ismeretlen",
        keresztnev: "(nem gyülekezeti tag)",
        datuma: m.datuma,
        helye: m.helye,
        anyakonyviSzam: m.anyakonyviSzam,
        tanuk: m.tanuk,
        masVallasu: m.masVallasu,
        kulso: true,
        marriageId: m.id,
        vege: m.vege,
      };
    }
    return { ...spouse, datuma: m.datuma, helye: m.helye, anyakonyviSzam: m.anyakonyviSzam, tanuk: m.tanuk, masVallasu: m.masVallasu, kulso: false, marriageId: m.id, vege: m.vege };
  });

  // Házastárs a háztartás szerepeiből: ha nincs rögzített házasság, de a háztartásban egyértelműen van egy
  // családfő (apa/anya) és egy házastárs szerepű tag, ők egymás házastársai.
  const sajat = await prisma.householdMember.findFirst({ where: { personId, vege: null, household: {} } });
  if (sajat && (sajat.szerep === "CSALADFO" || sajat.szerep === "HAZASTARS")) {
    const masikSzerep = sajat.szerep === "CSALADFO" ? "HAZASTARS" : "CSALADFO";
    const parok = await prisma.householdMember.findMany({
      where: { householdId: sajat.householdId, vege: null, szerep: masikSzerep, personId: { not: personId }, person: { deletedAt: null, elkoltozott: false } },
      include: { person: { select: personSelect } },
    });
    if (parok.length === 1 && !hazastarsak.some((h) => h.id === parok[0].person.id)) {
      hazastarsak.push({ ...parok[0].person, datuma: null, helye: null, anyakonyviSzam: null, tanuk: null, kulso: false, marriageId: "", vege: null, haztartasbol: true });
    }
  }

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
    include: { person: { select: { id: true, vezeteknev: true, leanykoriNev: true, keresztnev: true, nem: true, szuletesiDatum: true, elhunyt: true } } },
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

// ---------- Szülők a keresztelési anyakönyv neveiből ----------

const nevTokenek = (s: string | null | undefined): string[] =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["id", "ifj", "ozv"].includes(t));
const tokenEgyezik = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
/** Az "egyik" lista minden eleme megvan a "masik" listában (ékezet nélkül, 4 betűs előtaggal is). */
const mindenMegvan = (egyik: string[], masik: string[]) => egyik.length > 0 && egyik.every((t) => masik.some((m) => tokenEgyezik(t, m)));

type KapcsolatJelolt = { id: string; vezeteknev: string; keresztnev: string; leanykoriNev: string | null; nem: "FERFI" | "NO"; szuletesiDatum: Date | null };

function evKulonbseg(szulo: Date | null, gyerek: Date | null): number | null {
  if (!szulo || !gyerek) return null;
  return (gyerek.getTime() - szulo.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/**
 * A keresztelési anyakönyvben szereplő szülő-nevek (apa, anya) alapján összeköti a gyereket a szüleivel.
 * Elsősorban a gyerek háztartásának tagjai között keres; ha ott nincs, a gyülekezet többi tagja között csak akkor,
 * ha egyértelmű (egyetlen találat, és a korkülönbség ismert és elfogadható). Meglévő kapcsolatot nem módosít, és ha a gyereknek
 * már van azonos nemű szülője, azt nem bántja. Visszaadja a létrehozott kapcsolatok számát.
 */
export async function szulokKeresztelesbol(childId: string, proba = false): Promise<number> {
  const child = await prisma.person.findUnique({
    where: { id: childId },
    include: { baptism: true, parentLinks: { include: { parent: { select: { nem: true } } } }, householdMemberships: { where: { vege: null }, select: { householdId: true } } },
  });
  if (!child || child.deletedAt || !child.baptism) return 0;
  const apaNev = child.baptism.szuloApaNev?.trim();
  const anyaNev = child.baptism.szuloAnyaNev?.trim();
  if (!apaNev && !anyaNev) return 0;
  const vanApa = child.parentLinks.some((l) => l.parent.nem === "FERFI");
  const vanAnya = child.parentLinks.some((l) => l.parent.nem === "NO");
  const select = { id: true, vezeteknev: true, keresztnev: true, leanykoriNev: true, nem: true, szuletesiDatum: true } as const;

  const haztartasIds = child.householdMemberships.map((m) => m.householdId);
  const haziak: KapcsolatJelolt[] = haztartasIds.length
    ? (
        await prisma.householdMember.findMany({
          where: { householdId: { in: haztartasIds }, vege: null, personId: { not: childId }, person: { deletedAt: null } },
          include: { person: { select } },
        })
      ).map((m) => m.person)
    : [];
  const gyulekezetiek = async (nem: "FERFI" | "NO"): Promise<KapcsolatJelolt[]> =>
    prisma.person.findMany({ where: { gyulekezetId: child.gyulekezetId, nem, deletedAt: null, id: { not: childId } }, select });

  const korOk = (j: KapcsolatJelolt, anya: boolean) => {
    const k = evKulonbseg(j.szuletesiDatum, child.szuletesiDatum);
    return k === null ? null : k >= 15 && k <= (anya ? 50 : 65);
  };
  async function keres(nev: string, nem: "FERFI" | "NO", apaJelolt?: KapcsolatJelolt | null): Promise<KapcsolatJelolt | null> {
    const nevTk = nevTokenek(nev);
    const egyezik = (j: KapcsolatJelolt) => {
      if (j.nem !== nem) return false;
      const kerTk = nevTokenek(j.keresztnev);
      if (!mindenMegvan(kerTk, nevTk)) return false;
      const vezTk = nevTokenek(j.vezeteknev);
      if (nem === "FERFI") return mindenMegvan(vezTk, nevTk);
      // anya: leánykori név, a nevében szereplő családnév, vagy (házas név) azonos az apa családnevével
      if (j.leanykoriNev && mindenMegvan(nevTokenek(j.leanykoriNev), nevTk)) return true;
      if (mindenMegvan(vezTk, nevTk)) return true;
      return !!apaJelolt && mindenMegvan(vezTk, nevTokenek(apaJelolt.vezeteknev));
    };
    const haz = haziak.filter(egyezik).filter((j) => korOk(j, nem === "NO") !== false);
    if (haz.length === 1) return haz[0];
    if (haz.length > 1) return null;
    const mind = (await gyulekezetiek(nem)).filter(egyezik).filter((j) => korOk(j, nem === "NO") === true);
    return mind.length === 1 ? mind[0] : null;
  }

  let letrehozva = 0;
  const kapcsol = async (parentId: string) => {
    if (parentId === childId) return;
    const letezo = await prisma.familyLink.findFirst({ where: { parentId, childId } });
    const fordito = await prisma.familyLink.findFirst({ where: { parentId: childId, childId: parentId } });
    if (letezo || fordito) return;
    if (proba) console.log(`[próba] ${child!.vezeteknev} ${child!.keresztnev} <- szülő ${parentId} (keresztelési anyakönyv: ${apaNev ?? ""} / ${anyaNev ?? ""})`);
    else await prisma.familyLink.create({ data: { parentId, childId } });
    letrehozva++;
  };
  let apa: KapcsolatJelolt | null = null;
  if (apaNev && !vanApa) {
    apa = await keres(apaNev, "FERFI");
    if (apa) await kapcsol(apa.id);
  }
  if (anyaNev && !vanAnya) {
    const anya = await keres(anyaNev, "NO", apa);
    if (anya) await kapcsol(anya.id);
  }
  return letrehozva;
}

/**
 * Ha a szülőnek van (nem lezárt) házastársa, aki a gyerekkel egy háztartásban él, és a gyereknek még nincs azonos nemű szülője,
 * a házastársat is hozzáadja szülőnek - így az egyik szülő rögzítése a másiknál is megjelenik. Ismert születési dátumoknál a
 * korkülönbségnek elfogadhatónak kell lennie. Visszaadja a létrehozott kapcsolatok számát (0 vagy 1).
 */
export async function masikSzuloHazastarsbol(parentId: string, childId: string): Promise<number> {
  const hazassag = await prisma.marriage.findFirst({
    where: { deletedAt: null, vege: null, OR: [{ spouseAId: parentId, spouseBId: { not: null } }, { spouseBId: parentId }] },
  });
  if (!hazassag) return 0;
  const masikId = hazassag.spouseAId === parentId ? hazassag.spouseBId : hazassag.spouseAId;
  if (!masikId || masikId === childId) return 0;
  const [masik, gyerek, vanLink] = await Promise.all([
    prisma.person.findUnique({ where: { id: masikId }, select: { id: true, nem: true, szuletesiDatum: true, deletedAt: true, elhunyt: true } }),
    prisma.person.findUnique({ where: { id: childId }, select: { szuletesiDatum: true } }),
    prisma.familyLink.findMany({ where: { childId }, include: { parent: { select: { nem: true } } } }),
  ]);
  if (!masik || masik.deletedAt || !gyerek) return 0;
  if (vanLink.some((l) => l.parentId === masikId || l.parent.nem === masik.nem)) return 0;
  const k = evKulonbseg(masik.szuletesiDatum, gyerek.szuletesiDatum);
  if (k !== null && (k < 15 || k > (masik.nem === "NO" ? 50 : 65))) return 0;
  // egy háztartásban kell élniük (különben nem tudjuk, hogy a házastárs is szülő)
  const gyerekHaz = await prisma.householdMember.findMany({ where: { personId: childId, vege: null }, select: { householdId: true } });
  if (gyerekHaz.length === 0) return 0;
  const kozos = await prisma.householdMember.findFirst({ where: { personId: masikId, vege: null, householdId: { in: gyerekHaz.map((g) => g.householdId) } } });
  if (!kozos) return 0;
  if (await prisma.familyLink.findFirst({ where: { parentId: childId, childId: masikId } })) return 0;
  await prisma.familyLink.create({ data: { parentId: masikId, childId } });
  return 1;
}

// ---------- Házasság a háztartási szerepekből ----------

/**
 * Ha a háztartásban pontosan egy (élő, helyben lakó) családfő és pontosan egy házastárs szerepű tag van, és köztük nincs rögzített
 * házasság, létrehozza a házasságot (dátum nélkül) - így mindkét félnél ugyanúgy megjelenik. Ha valamelyiknek már van másik,
 * nem lezárt házassága, nem nyúl hozzá. A "nőtlen/hajadon" vagy üres családi állapotot "házas"-ra állítja.
 */
export async function hazassagokHaztartasbol(householdId: string, proba = false): Promise<number> {
  const tagok = await prisma.householdMember.findMany({
    where: { householdId, vege: null, szerep: { in: ["CSALADFO", "HAZASTARS"] }, person: { deletedAt: null, elhunyt: false, elkoltozott: false } },
    select: { personId: true, szerep: true },
  });
  const cf = tagok.filter((t) => t.szerep === "CSALADFO");
  const hz = tagok.filter((t) => t.szerep === "HAZASTARS");
  if (cf.length !== 1 || hz.length !== 1) return 0;
  const [a, b] = [cf[0].personId, hz[0].personId];
  const van = await prisma.marriage.findFirst({
    where: { deletedAt: null, OR: [{ spouseAId: a, spouseBId: b }, { spouseAId: b, spouseBId: a }] },
  });
  if (van) return 0;
  const masikAktiv = await prisma.marriage.findFirst({
    where: { deletedAt: null, vege: null, OR: [{ spouseAId: { in: [a, b] } }, { spouseBId: { in: [a, b] } }] },
  });
  if (masikAktiv) return 0;
  if (proba) { console.log(`[próba] házasság a háztartás szerepeiből: ${a} + ${b}`); return 1; }
  await prisma.marriage.create({ data: { spouseAId: a, spouseBId: b } });
  for (const id of [a, b]) {
    const p = await prisma.person.findUnique({ where: { id }, select: { csaladiAllapot: true } });
    if (p && (p.csaladiAllapot === null || p.csaladiAllapot === "NOTLEN_HAJADON")) await prisma.person.update({ where: { id }, data: { csaladiAllapot: "HAZAS" } });
  }
  return 1;
}

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
    include: { person: { select: { id: true, vezeteknev: true, leanykoriNev: true, keresztnev: true, nem: true, szuletesiDatum: true, elhunyt: true, elkoltozott: true } } },
  });
  const elok = tagok.filter((m) => !m.person.elkoltozott);
  // 1) a keresztelési anyakönyv szülő-nevei (dátum nélkül is egyértelmű), 2) házasság a családfő + házastárs szerepből
  let nevekbolLetrehozva = 0;
  for (const t of elok) nevekbolLetrehozva += await szulokKeresztelesbol(t.personId);
  await hazassagokHaztartasbol(householdId);
  const szulok = elok.filter((m) => (m.szerep === "CSALADFO" || m.szerep === "HAZASTARS") && !m.person.elhunyt);
  const gyerekek = elok.filter((m) => m.szerep === "GYERMEK");
  if (szulok.length === 0 || gyerekek.length === 0) return { letrehozva: nevekbolLetrehozva, kihagyva: [] };

  const meglevo = await prisma.familyLink.findMany({
    where: { parentId: { in: szulok.map((s) => s.personId) }, childId: { in: gyerekek.map((g) => g.personId) } },
    select: { parentId: true, childId: true },
  });
  const van = new Set(meglevo.map((l) => `${l.parentId}:${l.childId}`));
  let letrehozva = nevekbolLetrehozva;
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

/** A háztartási szerepek (családfő + házastárs) alapján megállapított házastárs özvegyre állítása a másik elhalálozásakor. */
async function haztartasiHazastarsOzvegy(personId: string): Promise<void> {
  const own = await prisma.householdMember.findFirst({ where: { personId, vege: null } });
  if (!own || (own.szerep !== "CSALADFO" && own.szerep !== "HAZASTARS")) return;
  const masikSzerep = own.szerep === "CSALADFO" ? "HAZASTARS" : "CSALADFO";
  const parok = await prisma.householdMember.findMany({
    where: { householdId: own.householdId, vege: null, szerep: masikSzerep, personId: { not: personId }, person: { deletedAt: null, elhunyt: false } },
    include: { person: { select: { id: true, csaladiAllapot: true, elkoltozott: true } } },
  });
  const el = parok.filter((m) => !m.person.elkoltozott);
  if (el.length !== 1) return; // csak egyértelmű házastársnál
  const hazastars = el[0].person;
  if (hazastars.csaladiAllapot === null || hazastars.csaladiAllapot === "HAZAS") {
    await prisma.person.update({ where: { id: hazastars.id }, data: { csaladiAllapot: "OZVEGY" } });
  }
}
