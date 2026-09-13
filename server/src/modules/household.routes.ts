import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { getCurrentDuesBands, getDuesBandsForYear, computeMemberDuesInfo } from "./duesCalc.js";
import { ageOn } from "../lib/age.js";
import { matchesAllWords } from "../lib/search.js";

const memberPersonSelect = {
  id: true,
  vezeteknev: true,
  keresztnev: true,
  nem: true,
  szuletesiDatum: true,
  elhunyt: true,
  vallas: true,
  nyitoTartozas: true,
  marriagesA: { where: { vege: null }, select: { kulsoHazastarsVallasa: true } },
  marriagesB: { where: { vege: null }, select: { kulsoHazastarsVallasa: true } },
  positions: { where: { vege: null }, select: { tisztseg: true } },
  confirmation: { select: { id: true } },
  duesPayments: { select: { ev: true } },
} as const;

/** A folyó és a tavalyi év korsáv-készlete egyben (a computeMemberDuesInfo mindkettőt igényli). */
async function loadDuesBandsForCurrentAndPrevYear(gyulekezetId: string) {
  const currentYear = new Date().getFullYear();
  const [currentYearBands, prevYearBands] = await Promise.all([
    getCurrentDuesBands(gyulekezetId),
    getDuesBandsForYear(gyulekezetId, currentYear - 1),
  ]);
  return { currentYearBands, prevYearBands };
}

interface HouseholdListQuery {
  gyulekezetId?: string;
  q?: string;
  elhunyt?: string;
  nem?: string;
  korTol?: string;
  korIg?: string;
  tisztseg?: string;
  konfirmalt?: string;
}

function memberMatchesFilters(
  person: {
    vezeteknev: string;
    keresztnev: string;
    nem: string;
    elhunyt: boolean;
    szuletesiDatum: Date | null;
    positions: { tisztseg: string }[];
    confirmation: unknown;
  },
  query: HouseholdListQuery
): boolean {
  if (query.elhunyt !== undefined && person.elhunyt !== (query.elhunyt === "true")) return false;
  if ((query.nem === "FERFI" || query.nem === "NO") && person.nem !== query.nem) return false;
  if (query.tisztseg) {
    const wanted = query.tisztseg.split(",");
    if (!person.positions.some((p) => wanted.includes(p.tisztseg))) return false;
  }
  if (query.konfirmalt === "true" && !person.confirmation) return false;
  if (query.korTol !== undefined || query.korIg !== undefined) {
    if (!person.szuletesiDatum) return false;
    const age = ageOn(person.szuletesiDatum, new Date());
    if (query.korTol !== undefined && age < Number(query.korTol)) return false;
    if (query.korIg !== undefined && age > Number(query.korIg)) return false;
  }
  return true;
}

function vallasokOfMembers(members: { person: { vallas: string | null; marriagesA: { kulsoHazastarsVallasa: string | null }[]; marriagesB: { kulsoHazastarsVallasa: string | null }[] } }[]) {
  const vallasok = new Set<string>();
  for (const m of members) {
    if (m.person.vallas) vallasok.add(m.person.vallas);
    for (const marr of m.person.marriagesA) if (marr.kulsoHazastarsVallasa) vallasok.add(marr.kulsoHazastarsVallasa);
    for (const marr of m.person.marriagesB) if (marr.kulsoHazastarsVallasa) vallasok.add(marr.kulsoHazastarsVallasa);
  }
  return vallasok;
}

export async function householdRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/households/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    const household = await prisma.household.findUnique({
      where: { id },
      include: {
        address: true,
        members: { include: { person: { select: memberPersonSelect } } },
      },
    });
    if (!household) return reply.code(404).send({ error: "Nem található" });
    const accessible = await getAccessibleGyulekezetIds(user);
    if (accessible !== "ALL" && !accessible.includes(household.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const { currentYearBands, prevYearBands } = await loadDuesBandsForCurrentAndPrevYear(household.gyulekezetId);
    const vallasTipus = household.vallasTipusManualis ?? (vallasokOfMembers(household.members).size <= 1 ? "EGYEZO" : "VEGYES");

    return {
      ...household,
      vallasTipus,
      members: household.members.map((m) => ({
        ...m,
        ...computeMemberDuesInfo(m.person, currentYearBands, prevYearBands),
      })),
    };
  });

  // Cím szerinti csoportosítás: egy címen hány háztartás van
  app.get("/api/households", async (req, reply) => {
    const user = req.currentUser!;
    const query = (req.query as HouseholdListQuery) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);
    if (query.gyulekezetId && accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const where: Record<string, unknown> =
      accessible === "ALL" ? {} : { gyulekezetId: { in: accessible } };
    if (query.gyulekezetId) {
      where.gyulekezetId = query.gyulekezetId;
    }
    // A névre/címre kereső "q" szándékosan NEM itt, az adatbázis-szintű where-ben szűr - a
    // Postgres `contains` ékezet-érzékeny lenne (pl. "szabo" nem találná meg "Szabó"-t), ezért
    // a q-alapú illesztés lejjebb, memóriában (ld. matchesAllWords) történik.

    let households = await prisma.household.findMany({
      where,
      include: {
        address: true,
        members: { include: { person: { select: memberPersonSelect } } },
      },
    });

    // Ha van bármilyen szűrő (kor, tisztség, nem, elhunyt, konfirmált, vagy névre illő keresés),
    // a háztartás csak akkor marad meg, ha van legalább egy megfelelő tagja - és a válaszban is
    // csak a ténylegesen megfelelő tagok jelennek meg (nem az egész család), hogy az áttekintőből
    // kattintva pontosan a keresett kategóriába tartozó személyek listázódjanak.
    const hasMemberFilter =
      query.elhunyt !== undefined ||
      query.nem !== undefined ||
      query.korTol !== undefined ||
      query.korIg !== undefined ||
      query.tisztseg !== undefined ||
      query.konfirmalt !== undefined;

    function personNameMatchesQ(person: { vezeteknev: string; keresztnev: string }): boolean {
      if (!query.q) return true;
      return matchesAllWords([person.vezeteknev, person.keresztnev], query.q);
    }

    function addressMatchesQ(address: { utca: string; telepules: string; hazszam: string }): boolean {
      if (!query.q) return false;
      return matchesAllWords([address.utca, address.telepules, address.hazszam], query.q);
    }

    const matchingMembersByHousehold = new Map<string, typeof households[number]["members"]>();
    if (hasMemberFilter || query.q) {
      households = households.filter((h) => {
        const matching = h.members.filter((m) => personNameMatchesQ(m.person) && memberMatchesFilters(m.person, query));
        matchingMembersByHousehold.set(h.id, matching);
        return matching.length > 0 || (query.q !== undefined && !hasMemberFilter && addressMatchesQ(h.address));
      });
    }

    // ABC sorrend utca szerint, majd házszám szerint (numerikusan, ha lehet)
    households.sort((a, b) => {
      const utcaCompare = a.address.utca.localeCompare(b.address.utca, "hu");
      if (utcaCompare !== 0) return utcaCompare;
      const aNum = parseInt(a.address.hazszam, 10);
      const bNum = parseInt(b.address.hazszam, 10);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) return aNum - bNum;
      return a.address.hazszam.localeCompare(b.address.hazszam, "hu");
    });

    // hány háztartás van ugyanazon a címen
    const addressCounts = new Map<string, number>();
    for (const h of households) {
      addressCounts.set(h.addressId, (addressCounts.get(h.addressId) ?? 0) + 1);
    }

    // gyülekezetenkénti korsáv-készletek cache-elve, hogy ne kérdezzük le minden háztartásnál újra
    const bandsCache = new Map<string, Awaited<ReturnType<typeof loadDuesBandsForCurrentAndPrevYear>>>();
    async function getDuesBands(gyulekezetId: string) {
      let cached = bandsCache.get(gyulekezetId);
      if (!cached) {
        cached = await loadDuesBandsForCurrentAndPrevYear(gyulekezetId);
        bandsCache.set(gyulekezetId, cached);
      }
      return cached;
    }

    const result = [];
    for (const h of households) {
      const vallasTipus = h.vallasTipusManualis ?? (vallasokOfMembers(h.members).size <= 1 ? "EGYEZO" : "VEGYES");
      const { currentYearBands, prevYearBands } = await getDuesBands(h.gyulekezetId);
      const matching = matchingMembersByHousehold.get(h.id);
      const membersToShow = matching && matching.length > 0 ? matching : h.members;
      result.push({
        id: h.id,
        nev: h.nev,
        gyulekezetId: h.gyulekezetId,
        address: h.address,
        tobbCsaladEzenACimen: (addressCounts.get(h.addressId) ?? 0) > 1,
        vallasTipus,
        tagok: membersToShow.map((m) => ({
          ...m.person,
          szerep: m.szerep,
          ...computeMemberDuesInfo(m.person, currentYearBands, prevYearBands),
        })),
      });
    }
    return result;
  });

  app.post("/api/households", async (req, reply) => {
    const schema = z.object({
      nev: z.string().optional().nullable(),
      gyulekezetId: z.string(),
      address: z.object({
        iranyitoszam: z.string().optional().nullable(),
        telepules: z.string().min(1),
        utca: z.string().min(1),
        hazszam: z.string().min(1),
        emeletAjto: z.string().optional().nullable(),
      }),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, parsed.data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság ehhez a gyülekezethez" });
    }
    const data = parsed.data;

    const address = await prisma.address.upsert({
      where: {
        telepules_utca_hazszam_emeletAjto: {
          telepules: data.address.telepules,
          utca: data.address.utca,
          hazszam: data.address.hazszam,
          emeletAjto: data.address.emeletAjto ?? "",
        },
      },
      create: {
        iranyitoszam: data.address.iranyitoszam ?? null,
        telepules: data.address.telepules,
        utca: data.address.utca,
        hazszam: data.address.hazszam,
        emeletAjto: data.address.emeletAjto ?? "",
      },
      update: {},
    });

    const household = await prisma.household.create({
      data: {
        nev: data.nev ?? null,
        addressId: address.id,
        gyulekezetId: data.gyulekezetId,
      },
    });
    return household;
  });

  app.post("/api/households/:id/members", async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({
      personId: z.string(),
      szerep: z.enum(["CSALADFO", "HAZASTARS", "GYERMEK", "EGYEB"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const user = req.currentUser!;
    const household = await prisma.household.findUnique({ where: { id } });
    if (!household) return reply.code(404).send({ error: "Nem található" });
    if (!isAdmin(user) && !canEditGyulekezet(user, household.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person || person.gyulekezetId !== household.gyulekezetId) {
      return reply.code(400).send({ error: "A személy nem ehhez a gyülekezethez tartozik" });
    }

    const member = await prisma.householdMember.create({
      data: { householdId: id, personId: parsed.data.personId, szerep: parsed.data.szerep },
    });
    return member;
  });

  // Egy meglévő háztartási tagság szerepének (családfő/házastárs/gyermek/egyéb) utólagos
  // módosítása - ez a mező a személy háztartáson BELÜLI szerepét jelöli, függetlenül a
  // Person saját családi állapotától (nőtlen/házas/özvegy/elvált), ezért a kettő sosem
  // szinkronizálódik automatikusan; ha az egyik változik, a másikat külön kell frissíteni.
  app.put("/api/household-members/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ szerep: z.enum(["CSALADFO", "HAZASTARS", "GYERMEK", "EGYEB"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const existing = await prisma.householdMember.findUnique({ where: { id }, include: { household: true } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.household.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const updated = await prisma.householdMember.update({ where: { id }, data: { szerep: parsed.data.szerep } });
    return updated;
  });
}
