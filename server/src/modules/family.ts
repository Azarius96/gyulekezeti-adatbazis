import { prisma } from "../lib/prisma.js";

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

export interface FamilyOverview {
  szulok: { id: string; vezeteknev: string; keresztnev: string; linkId: string }[];
  nagyszulok: { id: string; vezeteknev: string; keresztnev: string }[];
  gyermekek: { id: string; vezeteknev: string; keresztnev: string; linkId: string }[];
  unokak: { id: string; vezeteknev: string; keresztnev: string }[];
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
  testverek: { id: string; vezeteknev: string; keresztnev: string }[];
}

const personSelect = { id: true, vezeteknev: true, keresztnev: true } as const;

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
  const nagyszulok = grandparentLinks.map((l) => l.parent);

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
  const unokak = grandchildLinks.map((l) => l.child);

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
