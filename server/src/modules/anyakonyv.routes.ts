import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, type AuthUser } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

/**
 * ANYAKÖNYVEK MODUL
 * =================
 * A 2006. évi 1. jogszabály (RRE törvénytár) szerint a lelkipásztor köteles az egyházi
 * anyakönyveket (keresztelési, konfirmációs, házassági, temetési) előírás szerint vezetni,
 * és azokról a presbitériumnak/közgyűlésnek évi jelentést készíteni. Ez a modul nem új
 * adatokat vezet be - a keresztelés/konfirmáció/házasság/temetés adatai már léteznek
 * (Baptism, Confirmation, Marriage, Burial), csak egy évenként áttekinthető, könnyen
 * ellenőrizhető lista- (és jelentés-) nézetet ad hozzájuk.
 */

async function resolveGyulekezetScope(
  user: AuthUser,
  requestedGyulekezetId: string | undefined
): Promise<{ ok: true; gyulekezetWhere: Record<string, unknown> } | { ok: false }> {
  const accessible = await getAccessibleGyulekezetIds(user);

  if (requestedGyulekezetId) {
    if (accessible !== "ALL" && !accessible.includes(requestedGyulekezetId)) return { ok: false };
    return { ok: true, gyulekezetWhere: { id: requestedGyulekezetId } };
  }

  if (accessible !== "ALL" && accessible.length === 0) return { ok: false };
  return { ok: true, gyulekezetWhere: accessible === "ALL" ? {} : { id: { in: accessible } } };
}

function yearRange(ev: number) {
  return { gte: new Date(ev, 0, 1), lte: new Date(ev, 11, 31, 23, 59, 59) };
}

const personSelect = { id: true, vezeteknev: true, keresztnev: true, szuletesiDatum: true } as const;

export async function anyakonyvRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  const querySchema = z.object({ gyulekezetId: z.string().optional(), ev: z.coerce.number().int().min(1900).max(3000) });

  app.get("/api/anyakonyv/keresztelesek", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    return prisma.baptism.findMany({
      where: { datuma: yearRange(parsed.data.ev), person: { gyulekezet: scope.gyulekezetWhere } },
      orderBy: { datuma: "asc" },
      select: {
        id: true,
        datuma: true,
        helye: true,
        lelkeszNeve: true,
        keresztszulok: true,
        person: { select: { ...personSelect, gyulekezet: { select: { nev: true } } } },
      },
    });
  });

  app.get("/api/anyakonyv/konfirmaciok", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    return prisma.confirmation.findMany({
      where: { datuma: yearRange(parsed.data.ev), person: { gyulekezet: scope.gyulekezetWhere } },
      orderBy: { datuma: "asc" },
      select: {
        id: true,
        datuma: true,
        helye: true,
        lelkeszNeve: true,
        person: { select: { ...personSelect, gyulekezet: { select: { nev: true } } } },
      },
    });
  });

  app.get("/api/anyakonyv/hazassagok", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    return prisma.marriage.findMany({
      where: { datuma: yearRange(parsed.data.ev), spouseA: { gyulekezet: scope.gyulekezetWhere } },
      orderBy: { datuma: "asc" },
      select: {
        id: true,
        datuma: true,
        helye: true,
        lelkeszNeve: true,
        vege: true,
        vegeOka: true,
        kulsoHazastarsNeve: true,
        spouseA: { select: { ...personSelect, gyulekezet: { select: { nev: true } } } },
        spouseB: { select: personSelect },
      },
    });
  });

  app.get("/api/anyakonyv/temetesek", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    return prisma.burial.findMany({
      where: { datuma: yearRange(parsed.data.ev), person: { gyulekezet: scope.gyulekezetWhere } },
      orderBy: { datuma: "asc" },
      select: {
        id: true,
        datuma: true,
        person: { select: { ...personSelect, elhunytDatuma: true, gyulekezet: { select: { nev: true } } } },
        sirhely: { select: { jelzes: true, parcella: { select: { jelzes: true, cemetery: { select: { nev: true } } } } } },
      },
    });
  });

  // Éves összesítő - a négy anyakönyv adott évi darabszáma egy pillantásra, a
  // presbitériumi/közgyűlési évi jelentéshez.
  app.get("/api/anyakonyv/osszesito", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    const range = yearRange(parsed.data.ev);
    const [keresztelesek, konfirmaciok, hazassagok, temetesek] = await Promise.all([
      prisma.baptism.count({ where: { datuma: range, person: { gyulekezet: scope.gyulekezetWhere } } }),
      prisma.confirmation.count({ where: { datuma: range, person: { gyulekezet: scope.gyulekezetWhere } } }),
      prisma.marriage.count({ where: { datuma: range, spouseA: { gyulekezet: scope.gyulekezetWhere } } }),
      prisma.burial.count({ where: { datuma: range, person: { gyulekezet: scope.gyulekezetWhere } } }),
    ]);
    return { keresztelesek, konfirmaciok, hazassagok, temetesek };
  });
}
