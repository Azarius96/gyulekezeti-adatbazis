import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { isAdmin, type AuthUser } from "../auth/scope.js";

/**
 * LELKÉSZEK TOVÁBBKÉPZÉSE
 * ========================
 * Nyilvántartja, hogy egy lelkész milyen továbbképzésen vett részt, hány kreditet kapott érte és mikor.
 *
 * - Olvasás: a rendszergazda és a "lelkészértekezleti elnök" rangú lelkész az összes lelkészét látja; egy
 *   sima lelkész csak a sajátját.
 * - Írás (felvétel, módosítás, törlés): csak a rendszergazda és a lelkészértekezleti elnök.
 */

function canManage(user: AuthUser): boolean {
  return isAdmin(user) || user.lelkeszertekezletiElnok;
}

function isLelkesz(user: AuthUser): boolean {
  return user.roles.some((r) => r.szerepKor === "LELKESZ");
}

function forbid(reply: FastifyReply) {
  return reply.code(403).send({ error: "Nincs jogosultság" });
}

const bodySchema = z.object({
  megnevezes: z.string().trim().min(1, "A továbbképzés megnevezése kötelező"),
  kredit: z.number().int().min(0).max(1000),
  datum: z.string().min(8),
  megjegyzes: z.string().optional().nullable(),
});

export async function tovabbkepzesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // A lelkészek (LELKESZ szerepkörű, aktív felhasználók) és a továbbképzéseik összesítése
  app.get("/api/tovabbkepzesek", async (req, reply) => {
    const me = req.currentUser!;
    const all = canManage(me);
    if (!all && !isLelkesz(me)) return forbid(reply);

    const users = await prisma.user.findMany({
      where: {
        active: true,
        roles: { some: { szerepKor: "LELKESZ" } },
        ...(all ? {} : { id: me.id }),
      },
      select: {
        id: true,
        nev: true,
        lelkeszertekezletiElnok: true,
        roles: { where: { szerepKor: "LELKESZ", gyulekezetId: { not: null } }, select: { gyulekezetId: true } },
        tovabbkepzesek: {
          where: { deletedAt: null },
          orderBy: { datum: "desc" },
          select: { id: true, megnevezes: true, kredit: true, datum: true, megjegyzes: true },
        },
      },
      orderBy: { nev: "asc" },
    });

    const gyulekezetIds = Array.from(new Set(users.flatMap((u) => u.roles.map((r) => r.gyulekezetId!))));
    const gyulekezetek = gyulekezetIds.length
      ? await prisma.gyulekezet.findMany({ where: { id: { in: gyulekezetIds } }, select: { id: true, nev: true } })
      : [];
    const nevek = new Map(gyulekezetek.map((g) => [g.id, g.nev]));

    return {
      szerkesztheto: all,
      lelkeszek: users.map((u) => ({
        id: u.id,
        nev: u.nev,
        elnok: u.lelkeszertekezletiElnok,
        gyulekezetek: u.roles.map((r) => nevek.get(r.gyulekezetId!)).filter(Boolean),
        osszKredit: u.tovabbkepzesek.reduce((sum, t) => sum + t.kredit, 0),
        tovabbkepzesek: u.tovabbkepzesek,
      })),
    };
  });

  app.post("/api/tovabbkepzesek", async (req, reply) => {
    if (!canManage(req.currentUser!)) return forbid(reply);
    const parsed = bodySchema.extend({ userId: z.string() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" });
    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, include: { roles: true } });
    if (!target || !target.roles.some((r) => r.szerepKor === "LELKESZ")) {
      return reply.code(400).send({ error: "A továbbképzés csak lelkészhez rögzíthető" });
    }
    return prisma.tovabbkepzes.create({
      data: {
        userId: target.id,
        megnevezes: parsed.data.megnevezes,
        kredit: parsed.data.kredit,
        datum: new Date(parsed.data.datum),
        megjegyzes: parsed.data.megjegyzes?.trim() || null,
      },
    });
  });

  app.put("/api/tovabbkepzesek/:id", async (req, reply) => {
    if (!canManage(req.currentUser!)) return forbid(reply);
    const { id } = req.params as { id: string };
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" });
    const existing = await prisma.tovabbkepzes.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    return prisma.tovabbkepzes.update({
      where: { id },
      data: {
        megnevezes: parsed.data.megnevezes,
        kredit: parsed.data.kredit,
        datum: new Date(parsed.data.datum),
        megjegyzes: parsed.data.megjegyzes?.trim() || null,
      },
    });
  });

  app.delete("/api/tovabbkepzesek/:id", async (req, reply) => {
    if (!canManage(req.currentUser!)) return forbid(reply);
    const { id } = req.params as { id: string };
    const existing = await prisma.tovabbkepzes.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    await prisma.tovabbkepzes.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
