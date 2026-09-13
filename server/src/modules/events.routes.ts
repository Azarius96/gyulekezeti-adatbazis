import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, approvalScope, isAdmin, type AuthUser } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

export async function eventsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Hirdetőtábla: a felhasználó gyülekezetének(einek) saját eseményei (bármilyen státusszal),
  // plusz a hozzá tartozó egyházmegyei/kerületi szintre jóváhagyott események, időrendben.
  app.get("/api/events", async (req, reply) => {
    const user = req.currentUser!;
    const query = (req.query as { gyulekezetId?: string }) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);

    if (isAdmin(user)) {
      const where = query.gyulekezetId ? { gyulekezetId: query.gyulekezetId } : {};
      return prisma.event.findMany({
        where,
        include: { gyulekezet: { select: { nev: true } } },
        orderBy: { datuma: "asc" },
      });
    }

    if (query.gyulekezetId && accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const gyulekezetIds = query.gyulekezetId ? [query.gyulekezetId] : accessible === "ALL" ? [] : accessible;
    const { egyhazmegyeIds, keruletIds } = approvalScope(user);

    // az elérhető gyülekezetek egyházmegyéje/kerülete is számít, hogy a jóváhagyott
    // megyei/kerületi híreket mindenki lássa, aki abba a körbe tartozik
    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: { id: { in: gyulekezetIds } },
      select: { egyhazmegyeId: true, egyhazmegye: { select: { keruletId: true } } },
    });
    const relevantEgyhazmegyeIds = new Set([...egyhazmegyeIds, ...gyulekezetek.map((g) => g.egyhazmegyeId)]);
    const relevantKeruletIds = new Set([...keruletIds, ...gyulekezetek.map((g) => g.egyhazmegye.keruletId)]);

    return prisma.event.findMany({
      where: {
        OR: [
          { gyulekezetId: { in: gyulekezetIds } },
          { szint: "MEGYEI", status: "JOVAHAGYVA", egyhazmegyeId: { in: Array.from(relevantEgyhazmegyeIds) } },
          { szint: "KERULETI", status: "JOVAHAGYVA", keruletId: { in: Array.from(relevantKeruletIds) } },
        ],
      },
      include: { gyulekezet: { select: { nev: true } } },
      orderBy: { datuma: "asc" },
    });
  });

  // Jóváhagyásra váró, szintemelést kérő események - esperesnek/püspöknek/adminnak.
  app.get("/api/events/pending", async (req) => {
    const user = req.currentUser!;
    if (isAdmin(user)) {
      return prisma.event.findMany({
        where: { status: "ESKALACIO_FUGGOBEN" },
        include: { gyulekezet: { select: { nev: true } } },
        orderBy: { datuma: "asc" },
      });
    }
    const { egyhazmegyeIds, keruletIds } = approvalScope(user);
    if (egyhazmegyeIds.length === 0 && keruletIds.length === 0) return [];
    return prisma.event.findMany({
      where: {
        status: "ESKALACIO_FUGGOBEN",
        OR: [
          { szint: "MEGYEI", egyhazmegyeId: { in: egyhazmegyeIds } },
          { szint: "KERULETI", keruletId: { in: keruletIds } },
        ],
      },
      include: { gyulekezet: { select: { nev: true } } },
      orderBy: { datuma: "asc" },
    });
  });

  const createSchema = z.object({
    cim: z.string().min(1),
    leiras: z.string().optional().nullable(),
    datuma: z.string(),
    gyulekezetId: z.string(),
    kertSzint: z.enum(["HELYI", "MEGYEI", "KERULETI"]),
  });

  app.post("/api/events", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    const data = parsed.data;
    if (!isAdmin(user) && !canEditGyulekezet(user, data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság ehhez a gyülekezethez" });
    }

    const gyulekezet = await prisma.gyulekezet.findUnique({
      where: { id: data.gyulekezetId },
      select: { egyhazmegyeId: true, egyhazmegye: { select: { keruletId: true } } },
    });
    if (!gyulekezet) return reply.code(404).send({ error: "Gyülekezet nem található" });

    const event = await prisma.event.create({
      data: {
        cim: data.cim,
        leiras: data.leiras ?? null,
        datuma: new Date(data.datuma),
        gyulekezetId: data.gyulekezetId,
        szint: data.kertSzint,
        status: data.kertSzint === "HELYI" ? "AKTIV" : "ESKALACIO_FUGGOBEN",
        egyhazmegyeId: gyulekezet.egyhazmegyeId,
        keruletId: gyulekezet.egyhazmegye.keruletId,
      },
    });
    return event;
  });

  function canApprove(user: AuthUser, event: { szint: string; egyhazmegyeId: string | null; keruletId: string | null }): boolean {
    if (isAdmin(user)) return true;
    const { egyhazmegyeIds, keruletIds } = approvalScope(user);
    if (event.szint === "MEGYEI") return !!event.egyhazmegyeId && egyhazmegyeIds.includes(event.egyhazmegyeId);
    if (event.szint === "KERULETI") return !!event.keruletId && keruletIds.includes(event.keruletId);
    return false;
  }

  app.put("/api/events/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!canApprove(user, event)) return reply.code(403).send({ error: "Nincs jogosultság" });
    return prisma.event.update({ where: { id }, data: { status: "JOVAHAGYVA" } });
  });

  app.put("/api/events/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!canApprove(user, event)) return reply.code(403).send({ error: "Nincs jogosultság" });
    return prisma.event.update({ where: { id }, data: { status: "ELUTASITVA" } });
  });

  app.delete("/api/events/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(event.gyulekezetId && canEditGyulekezet(user, event.gyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.event.delete({ where: { id } });
    return { ok: true };
  });
}
