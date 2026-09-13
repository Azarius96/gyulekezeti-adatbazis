import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet } from "../auth/scope.js";
import { getTeendoStatusok, filterUrgent } from "./teendok.js";

export async function teendokRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  async function accessibleGyulekezetek(req: any, requestedId: string | undefined) {
    const accessible = await getAccessibleGyulekezetIds(req.currentUser!);
    const where = requestedId
      ? { id: requestedId }
      : accessible === "ALL"
        ? {}
        : { id: { in: accessible } };
    if (requestedId && accessible !== "ALL" && !accessible.includes(requestedId)) return null;
    return prisma.gyulekezet.findMany({ where, select: { id: true, nev: true } });
  }

  // Egy adott (vagy az összes elérhető) gyülekezet minden teendőjének állapota - a teljes,
  // böngészhető listához (nem csak a sürgősekhez).
  app.get("/api/teendok", async (req, reply) => {
    const query = (req.query as { gyulekezetId?: string }) ?? {};
    const gyulekezetek = await accessibleGyulekezetek(req, query.gyulekezetId);
    if (gyulekezetek === null) return reply.code(403).send({ error: "Nincs jogosultság" });

    const result = await Promise.all(
      gyulekezetek.map(async (g) => ({
        gyulekezetId: g.id,
        gyulekezetNev: g.nev,
        teendok: await getTeendoStatusok(g.id),
      }))
    );
    return result;
  });

  // A harang alatt megjelenő, sürgető (lejárt vagy hamarosan esedékes, még nem teljesített)
  // teendők, minden elérhető gyülekezetre összesítve.
  app.get("/api/teendok/urgent", async (req) => {
    const accessible = await getAccessibleGyulekezetIds(req.currentUser!);
    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: accessible === "ALL" ? {} : { id: { in: accessible } },
      select: { id: true, nev: true },
    });
    const perGyulekezet = await Promise.all(
      gyulekezetek.map(async (g) => ({
        gyulekezetId: g.id,
        gyulekezetNev: g.nev,
        teendok: filterUrgent(await getTeendoStatusok(g.id)),
      }))
    );
    return perGyulekezet.filter((g) => g.teendok.length > 0);
  });

  app.post("/api/teendok/:teendoId/teljesit", async (req, reply) => {
    const { teendoId } = req.params as { teendoId: string };
    const schema = z.object({ gyulekezetId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    if (!canEditGyulekezet(req.currentUser!, parsed.data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const ev = new Date().getFullYear();
    await prisma.teendoTeljesites.upsert({
      where: { gyulekezetId_teendoId_ev: { gyulekezetId: parsed.data.gyulekezetId, teendoId, ev } },
      create: { gyulekezetId: parsed.data.gyulekezetId, teendoId, ev },
      update: { teljesitve: new Date() },
    });
    return { ok: true };
  });

  app.delete("/api/teendok/:teendoId/teljesit", async (req, reply) => {
    const { teendoId } = req.params as { teendoId: string };
    const schema = z.object({ gyulekezetId: z.string() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    if (!canEditGyulekezet(req.currentUser!, parsed.data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const ev = new Date().getFullYear();
    await prisma.teendoTeljesites
      .delete({ where: { gyulekezetId_teendoId_ev: { gyulekezetId: parsed.data.gyulekezetId, teendoId, ev } } })
      .catch(() => {});
    return { ok: true };
  });
}
