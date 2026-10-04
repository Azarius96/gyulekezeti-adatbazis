import type { FastifyInstance } from "fastify";
import { prisma, prismaIncludingDeleted } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { getAccessibleGyulekezetIds } from "../auth/scope.js";

/**
 * VÁLTOZÁS-TÖRTÉNET
 * ==================
 * Minden auditált modellen történt módosítást a Prisma-kiterjesztés (lib/prisma.ts) automatikusan
 * naplóz - ez a modul csak a naplóhoz való (jogosultsággal szűrt) hozzáférést adja: az admin
 * bármelyik gyülekezetre rá tud szűrni, egy lelkész csak a saját (elérhető) gyülekezeteinek
 * változásait látja, egy esperes pedig a sajátjai mellett az egyházmegyéje többi gyülekezetéét is
 * (összhangban azzal, hogy egyébként is csak megtekintheti, nem szerkesztheti azokat).
 */
export async function auditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/audit-log", async (req, reply) => {
    const user = req.currentUser!;
    const query =
      (req.query as { gyulekezetId?: string; entity?: string; entityId?: string; action?: string; page?: string; limit?: string }) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);

    if (query.gyulekezetId && accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const where: Record<string, unknown> = {};
    if (query.gyulekezetId) {
      where.gyulekezetId = query.gyulekezetId;
    } else if (accessible !== "ALL") {
      where.gyulekezetId = { in: accessible };
    }
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const gyulekezetIds = Array.from(new Set(rows.map((r) => r.gyulekezetId).filter((id): id is string => !!id)));
    const gyulekezetek = gyulekezetIds.length
      ? await prisma.gyulekezet.findMany({ where: { id: { in: gyulekezetIds } }, select: { id: true, nev: true } })
      : [];
    const nevMap = new Map(gyulekezetek.map((g) => [g.id, g.nev]));

    // Az érintett személy(ek) neve: a "Személy" bejegyzésnél maga a rekord, a kapcsolódó
    // rekordoknál (keresztelés, befizetés, tisztség, házasság stb.) a hivatkozott személy -
    // így a napló azt is megmondja, KIN történt a módosítás, nem csak azt, hogy mi.
    const snapshot = (r: (typeof rows)[number]) => ((r.after ?? r.before) ?? {}) as Record<string, unknown>;
    const personIdsOf = (r: (typeof rows)[number]): string[] => {
      const snap = snapshot(r);
      const ids: unknown[] =
        r.entity === "Person"
          ? [r.entityId]
          : [snap.personId, snap.spouseAId, snap.spouseBId, snap.parentId, snap.childId, snap.megvaltoPersonId];
      return ids.filter((x): x is string => typeof x === "string" && x.length > 0);
    };
    const allPersonIds = Array.from(new Set(rows.flatMap(personIdsOf)));
    const persons = allPersonIds.length
      ? await prismaIncludingDeleted.person.findMany({
          where: { id: { in: allPersonIds } },
          select: { id: true, vezeteknev: true, keresztnev: true },
        })
      : [];
    const personNev = new Map(persons.map((p) => [p.id, `${p.vezeteknev} ${p.keresztnev}`]));

    const householdIds = Array.from(
      new Set(rows.map((r) => (r.entity === "Household" ? r.entityId : (snapshot(r).householdId as string | undefined))).filter((x): x is string => !!x))
    );
    const households = householdIds.length
      ? await prismaIncludingDeleted.household.findMany({
          where: { id: { in: householdIds } },
          select: { id: true, address: { select: { telepules: true, utca: true, hazszam: true } } },
        })
      : [];
    const hhCim = new Map(households.map((h) => [h.id, `${h.address.telepules}, ${h.address.utca} ${h.address.hazszam}`]));

    return {
      total,
      page,
      limit,
      items: rows.map((r) => ({
        targetPersons: Array.from(new Set(personIdsOf(r).map((id) => personNev.get(id)).filter((n): n is string => !!n))),
        targetPersonId: personIdsOf(r)[0] ?? null,
        targetHousehold: hhCim.get((r.entity === "Household" ? r.entityId : (snapshot(r).householdId as string | undefined)) ?? "") ?? null,
        id: r.id,
        userId: r.userId,
        userNev: r.userNev,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        gyulekezetId: r.gyulekezetId,
        gyulekezetNev: r.gyulekezetId ? nevMap.get(r.gyulekezetId) ?? null : null,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt,
      })),
    };
  });

  // A gyülekezet-választóban felkínálandó gyülekezetek (accessible szűréssel) - hogy a felület
  // ne az összes gyülekezetet listázza egy lelkésznek, akinek úgyis csak a sajátjához van joga.
  app.get("/api/audit-log/gyulekezetek", async (req) => {
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    const where = accessible === "ALL" ? {} : { id: { in: accessible } };
    return prisma.gyulekezet.findMany({ where, select: { id: true, nev: true }, orderBy: { nev: "asc" } });
  });
}
