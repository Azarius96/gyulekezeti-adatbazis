import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, isAdmin } from "../auth/scope.js";

/**
 * KÖLTÖZÉSEK
 * ===========
 * Egy gyülekezeti tag elköltözésének rögzítése és - ha az új gyülekezet is ezt a rendszert
 * használja - a köztük lévő átadás/átvétel teljes folyamata:
 *
 * 1. A jelenlegi lelkész rögzíti a költözést (honnan, hova, mikor, miért). Ha a célgyülekezet
 *    NEM ismert vagy nem ebben a rendszerben van (pl. külföld, más felekezet), a kérés azonnal
 *    "ISMERETLEN_CELBA" státuszba kerül, és a személy a papírkosárba kerül (nem véglegesen -
 *    tévedés esetén onnan visszaállítható).
 * 2. Ha a célgyülekezet ebben a rendszerben van, a kérés "FUGGOBEN" (függőben) marad, és az ottani
 *    lelkész a rendszeren belüli értesítésben látja - a teljes, korábbi gyülekezetben rögzített
 *    adatokkal együtt -, majd elfogadhatja vagy elutasíthatja.
 * 3. Elfogadáskor az új lelkész megadja az új címet - ha azon a címen már van háztartás az ő
 *    gyülekezetében, a személy automatikusan abba kerül, egyébként a rendszer létrehozza az új
 *    háztartást. A személy `gyulekezetId`-je erre az új gyülekezetre változik, a régi
 *    háztartási tagsága lezárul, a "honnan költözött" adat pedig a MovingRequesten megmarad.
 */

const personSnapshotSelect = {
  id: true,
  vezeteknev: true,
  keresztnev: true,
  nem: true,
  szuletesiDatum: true,
  szuletesiHely: true,
  vallas: true,
  csaladiAllapot: true,
  megjegyzes: true,
  baptism: true,
  confirmation: true,
  householdMemberships: {
    where: { vege: null },
    select: { szerep: true, household: { select: { nev: true, address: true } } },
  },
} as const;

async function formatRegiCim(personId: string): Promise<string> {
  const membership = await prisma.householdMember.findFirst({
    where: { personId, vege: null },
    select: { household: { select: { address: true } } },
    orderBy: { kezdete: "desc" },
  });
  const addr = membership?.household.address;
  if (!addr) return "";
  return [addr.telepules, addr.utca, addr.hazszam].filter(Boolean).join(", ");
}

export async function movingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/moving-requests", async (req, reply) => {
    const query = (req.query as { gyulekezetId?: string }) ?? {};
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    if (query.gyulekezetId) {
      if (accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
        return reply.code(403).send({ error: "Nincs jogosultság" });
      }
    } else if (accessible !== "ALL" && accessible.length === 0) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const where = query.gyulekezetId
      ? { forrasGyulekezetId: query.gyulekezetId }
      : accessible === "ALL"
        ? {}
        : { forrasGyulekezetId: { in: accessible } };
    return prisma.movingRequest.findMany({
      where,
      orderBy: { kezdemenyezve: "desc" },
      include: {
        person: { select: { vezeteknev: true, keresztnev: true, gyulekezet: { select: { nev: true } } } },
        celGyulekezet: { select: { nev: true } },
      },
    });
  });

  app.get("/api/moving-requests/incoming", async (req) => {
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    const where =
      accessible === "ALL"
        ? { status: "FUGGOBEN" as const }
        : { status: "FUGGOBEN" as const, celGyulekezetId: { in: accessible } };
    return prisma.movingRequest.findMany({
      where,
      orderBy: { kezdemenyezve: "asc" },
      include: {
        person: { select: personSnapshotSelect },
        forrasGyulekezet: { select: { nev: true } },
        celGyulekezet: { select: { nev: true } },
      },
    });
  });

  const createSchema = z.object({
    personId: z.string(),
    celGyulekezetId: z.string().optional().nullable(),
    ujCim: z.string().optional().nullable(),
    indoklas: z.string().optional().nullable(),
    kezdemenyezve: z.string().optional(),
  });

  app.post("/api/moving-requests", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;

    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person) return reply.code(404).send({ error: "Nem található személy" });
    if (!isAdmin(user) && !canEditGyulekezet(user, person.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    if (parsed.data.celGyulekezetId && parsed.data.celGyulekezetId === person.gyulekezetId) {
      return reply.code(400).send({ error: "A célgyülekezet nem lehet ugyanaz, mint a jelenlegi" });
    }
    if (parsed.data.celGyulekezetId) {
      const cel = await prisma.gyulekezet.findUnique({ where: { id: parsed.data.celGyulekezetId } });
      if (!cel) return reply.code(400).send({ error: "A megadott célgyülekezet nem található" });
    }

    const regiCim = await formatRegiCim(person.id);
    const kezdemenyezve = parsed.data.kezdemenyezve ? new Date(parsed.data.kezdemenyezve) : new Date();

    if (parsed.data.celGyulekezetId) {
      const request = await prisma.movingRequest.create({
        data: {
          personId: person.id,
          regiCim,
          ujCim: parsed.data.ujCim ?? "",
          indoklas: parsed.data.indoklas ?? null,
          forrasGyulekezetId: person.gyulekezetId,
          celGyulekezetId: parsed.data.celGyulekezetId,
          status: "FUGGOBEN",
          kezdemenyezve,
        },
      });
      return request;
    }

    // Nincs (vagy nem ebben a rendszerben lévő) célgyülekezet - a költözés azonnal lezárul, a
    // személy "kiköltözött" állapotba kerül (nem a papírkosárba): kimarad a statisztikából és a
    // tartozók közül, de a Kiköltözöttek listában és az adatlapján megmarad. A háztartási tagsága lezárul.
    const [, request] = await prisma.$transaction([
      prisma.householdMember.updateMany({ where: { personId: person.id, vege: null }, data: { vege: kezdemenyezve } }),
      prisma.movingRequest.create({
        data: {
          personId: person.id,
          regiCim,
          ujCim: parsed.data.ujCim ?? "ismeretlen",
          indoklas: parsed.data.indoklas ?? null,
          forrasGyulekezetId: person.gyulekezetId,
          celGyulekezetId: null,
          status: "ISMERETLEN_CELBA",
          kezdemenyezve,
          elbiralva: new Date(),
        },
      }),
      prisma.person.update({ where: { id: person.id }, data: { elkoltozott: true } }),
    ]);
    return request;
  });

  // Visszaköltözés / tévedés javítása: a személy újra a gyülekezet aktív tagja lesz (háztartás nélkül -
  // a lelkész utána rendelheti hozzá a címhez).
  app.post("/api/persons/:id/visszakoltozott", async (req, reply) => {
    const { id } = req.params as { id: string };
    const person = await prisma.person.findUnique({ where: { id } });
    if (!person || !person.elkoltozott) return reply.code(404).send({ error: "Nem található kiköltözött személy" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, person.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.person.update({ where: { id }, data: { elkoltozott: false } });
    return { ok: true };
  });

  const editSchema = z.object({
    ujCim: z.string().optional(),
    indoklas: z.string().optional().nullable(),
    kezdemenyezve: z.string().optional(),
  });

  app.put("/api/moving-requests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.movingRequest.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(existing.forrasGyulekezetId && canEditGyulekezet(user, existing.forrasGyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const updated = await prisma.movingRequest.update({
      where: { id },
      data: {
        ...(parsed.data.ujCim !== undefined ? { ujCim: parsed.data.ujCim } : {}),
        ...(parsed.data.indoklas !== undefined ? { indoklas: parsed.data.indoklas } : {}),
        ...(parsed.data.kezdemenyezve !== undefined ? { kezdemenyezve: new Date(parsed.data.kezdemenyezve) } : {}),
      },
    });
    return updated;
  });

  app.delete("/api/moving-requests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.movingRequest.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(existing.forrasGyulekezetId && canEditGyulekezet(user, existing.forrasGyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.movingRequest.delete({ where: { id } });
    // Egy ismeretlen célba költözés törlése (tévedés javítása) a személyt újra aktív taggá teszi.
    if (existing.status === "ISMERETLEN_CELBA") {
      await prisma.person.updateMany({ where: { id: existing.personId, elkoltozott: true }, data: { elkoltozott: false } });
    }
    return { ok: true };
  });

  const acceptSchema = z.object({
    telepules: z.string().min(1),
    utca: z.string().min(1),
    hazszam: z.string().min(1),
    iranyitoszam: z.string().optional().nullable(),
    emeletAjto: z.string().optional().nullable(),
  });

  app.post("/api/moving-requests/:id/accept", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok - adja meg az új címet" });

    const existing = await prisma.movingRequest.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    if (existing.status !== "FUGGOBEN" || !existing.celGyulekezetId) {
      return reply.code(409).send({ error: "Ez a kérés már el lett bírálva, vagy nincs célgyülekezete" });
    }
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.celGyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const celGyulekezetId = existing.celGyulekezetId;
    const data = parsed.data;

    await prisma.$transaction(async (tx) => {
      const address = await tx.address.upsert({
        where: {
          telepules_utca_hazszam_emeletAjto: {
            telepules: data.telepules,
            utca: data.utca,
            hazszam: data.hazszam,
            emeletAjto: data.emeletAjto ?? "",
          },
        },
        create: {
          iranyitoszam: data.iranyitoszam ?? null,
          telepules: data.telepules,
          utca: data.utca,
          hazszam: data.hazszam,
          emeletAjto: data.emeletAjto ?? "",
        },
        update: {},
      });

      let household = await tx.household.findFirst({ where: { addressId: address.id, gyulekezetId: celGyulekezetId } });
      if (!household) {
        household = await tx.household.create({ data: { addressId: address.id, gyulekezetId: celGyulekezetId } });
      }

      await tx.householdMember.updateMany({
        where: { personId: existing.personId, vege: null },
        data: { vege: new Date() },
      });

      await tx.person.update({ where: { id: existing.personId }, data: { gyulekezetId: celGyulekezetId } });

      await tx.householdMember.create({
        data: { householdId: household.id, personId: existing.personId, szerep: "EGYEB" },
      });

      await tx.movingRequest.update({
        where: { id },
        data: { status: "ELFOGADVA", elbiralva: new Date() },
      });
    });

    return { ok: true };
  });

  app.post("/api/moving-requests/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.movingRequest.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    if (existing.status !== "FUGGOBEN" || !existing.celGyulekezetId) {
      return reply.code(409).send({ error: "Ez a kérés már el lett bírálva, vagy nincs célgyülekezete" });
    }
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.celGyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const updated = await prisma.movingRequest.update({
      where: { id },
      data: { status: "ELUTASITVA", elbiralva: new Date() },
    });
    return updated;
  });
}
