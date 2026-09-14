import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { applyWidowhoodCascade } from "./family.js";

/**
 * TEMETŐ MODUL
 * ============
 * A Temetői szabályzat (489/2006 sz. törvény 28. cikk, 102/2014 sz. törvény) szerinti
 * hierarchiát követi: egy egyházközség egy vagy több temetőt tarthat fenn, azon belül
 * parcellákra (sorokra), azon belül sírhelyekre osztva. Egy sírhelyen több temetés is
 * történhet (sírbontás/újrafelhasználás, ld. szabályzat 6.§ b., 21.§).
 *
 * Kis gyülekezeteknek nem kötelező előre felépíteniük a teljes parcella/sírhely fát:
 * a temetés rögzítésekor a parcella és a sírhely "menet közben" (find-or-create) is
 * létrehozható, pusztán a jelzésük megadásával.
 */

async function assertCanEditCemetery(user: Parameters<typeof canEditGyulekezet>[0], cemeteryId: string): Promise<string | null> {
  const cemetery = await prisma.cemetery.findUnique({ where: { id: cemeteryId }, select: { gyulekezetId: true } });
  if (!cemetery) return null;
  if (!isAdmin(user) && !canEditGyulekezet(user, cemetery.gyulekezetId)) return null;
  return cemetery.gyulekezetId;
}

async function assertCanEditSirhely(user: Parameters<typeof canEditGyulekezet>[0], sirhelyId: string): Promise<string | null> {
  const sirhely = await prisma.sirhely.findUnique({
    where: { id: sirhelyId },
    select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } },
  });
  if (!sirhely) return null;
  const gyulekezetId = sirhely.parcella.cemetery.gyulekezetId;
  if (!isAdmin(user) && !canEditGyulekezet(user, gyulekezetId)) return null;
  return gyulekezetId;
}

/** Egy gyülekezet adott évben érvényes sírhelyár-generációja (a legfrissebb, ami még nem későbbi az évnél). */
async function getGravePriceForYear(gyulekezetId: string, year: number) {
  const all = await prisma.gravePriceConfig.findMany({
    where: { gyulekezetId, ervenyesEttolEv: { lte: year } },
    orderBy: { ervenyesEttolEv: "desc" },
  });
  return all[0] ?? null;
}

export async function cemeteryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // A gyülekezet(ek) temetői, teljes parcella/sírhely/temetés/megváltás fával.
  app.get("/api/temeto", async (req, reply) => {
    const user = req.currentUser!;
    const query = (req.query as { gyulekezetId?: string }) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);

    if (query.gyulekezetId) {
      if (accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
        return reply.code(403).send({ error: "Nincs jogosultság" });
      }
    } else if (accessible !== "ALL" && accessible.length === 0) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const where = query.gyulekezetId ? { gyulekezetId: query.gyulekezetId } : accessible === "ALL" ? {} : { gyulekezetId: { in: accessible } };

    // FONTOS: a Prisma Client Extension (lib/prisma.ts) puha törlés elleni automatikus szűrése
    // csak a legfelső szintű ".findMany()" hívásra vonatkozik - egy include-dal beágyazott
    // kapcsolatra (mint itt a parcellak/sirhelyek/burials/purchases) NEM terjed ki, ezért ezeket
    // itt explicit módon kell kizárni, különben egy visszaállított/törölt temetés vagy
    // megváltás is foglaltnak tűnne.
    const cemeteries = await prisma.cemetery.findMany({
      where,
      orderBy: { nev: "asc" },
      include: {
        parcellak: {
          where: { deletedAt: null },
          orderBy: { jelzes: "asc" },
          include: {
            sirhelyek: {
              where: { deletedAt: null },
              orderBy: { jelzes: "asc" },
              include: {
                burials: {
                  where: { deletedAt: null },
                  orderBy: { datuma: "desc" },
                  include: { person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
                },
                purchases: {
                  where: { deletedAt: null },
                  orderBy: { datuma: "desc" },
                  include: { megvaltoPerson: { select: { id: true, vezeteknev: true, keresztnev: true } } },
                },
              },
            },
          },
        },
      },
    });
    return cemeteries;
  });

  // Az adott évben érvényes sírhelymegváltási ár - a temetés/megváltás rögzítő
  // űrlap ezzel tölti ki előre az összeget (szerkeszthető marad).
  app.get("/api/temeto/grave-price", async (req, reply) => {
    const user = req.currentUser!;
    const schema = z.object({ gyulekezetId: z.string(), ev: z.coerce.number().int().min(1900).max(3000).optional() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const accessible = await getAccessibleGyulekezetIds(user);
    if (accessible !== "ALL" && !accessible.includes(parsed.data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const year = parsed.data.ev ?? new Date().getFullYear();
    const config = await getGravePriceForYear(parsed.data.gyulekezetId, year);
    return {
      osszeg: config ? Number(config.osszeg) : null,
      ervenyessegEv: config?.ervenyessegEv ?? null,
    };
  });

  // ---------- Temető ----------

  app.post("/api/temeto/cemeteries", async (req, reply) => {
    const schema = z.object({
      gyulekezetId: z.string(),
      nev: z.string().min(1),
      cim: z.string().optional().nullable(),
      telekkonyvSzam: z.string().optional().nullable(),
      helyrajziSzam: z.string().optional().nullable(),
      teruletNm: z.number().int().positive().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, parsed.data.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const cemetery = await prisma.cemetery.create({ data: parsed.data });
    return cemetery;
  });

  app.put("/api/temeto/cemeteries/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const gyulekezetId = await assertCanEditCemetery(req.currentUser!, id);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });
    const schema = z.object({
      nev: z.string().min(1).optional(),
      cim: z.string().optional().nullable(),
      telekkonyvSzam: z.string().optional().nullable(),
      helyrajziSzam: z.string().optional().nullable(),
      teruletNm: z.number().int().positive().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const cemetery = await prisma.cemetery.update({ where: { id }, data: parsed.data });
    return cemetery;
  });

  app.delete("/api/temeto/cemeteries/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const gyulekezetId = await assertCanEditCemetery(req.currentUser!, id);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });
    await prisma.cemetery.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---------- Parcella ----------

  app.post("/api/temeto/parcellak", async (req, reply) => {
    const schema = z.object({ cemeteryId: z.string(), jelzes: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const gyulekezetId = await assertCanEditCemetery(req.currentUser!, parsed.data.cemeteryId);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });
    try {
      const parcella = await prisma.parcella.create({ data: parsed.data });
      return parcella;
    } catch {
      return reply.code(400).send({ error: "Már létezik ilyen jelzésű parcella ebben a temetőben" });
    }
  });

  app.put("/api/temeto/parcellak/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.parcella.findUnique({ where: { id }, select: { cemetery: { select: { gyulekezetId: true } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({ jelzes: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    try {
      const parcella = await prisma.parcella.update({ where: { id }, data: parsed.data });
      return parcella;
    } catch {
      return reply.code(400).send({ error: "Már létezik ilyen jelzésű parcella ebben a temetőben" });
    }
  });

  app.delete("/api/temeto/parcellak/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.parcella.findUnique({ where: { id }, select: { cemetery: { select: { gyulekezetId: true } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.parcella.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---------- Sírhely ----------

  app.post("/api/temeto/sirhelyek", async (req, reply) => {
    const schema = z.object({ parcellaId: z.string(), jelzes: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const parcella = await prisma.parcella.findUnique({ where: { id: parsed.data.parcellaId }, select: { cemetery: { select: { gyulekezetId: true } } } });
    if (!parcella) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, parcella.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    try {
      const sirhely = await prisma.sirhely.create({ data: parsed.data });
      return sirhely;
    } catch {
      return reply.code(400).send({ error: "Már létezik ilyen jelzésű sírhely ebben a parcellában" });
    }
  });

  app.put("/api/temeto/sirhelyek/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const gyulekezetId = await assertCanEditSirhely(req.currentUser!, id);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });
    const schema = z.object({ jelzes: z.string().min(1).optional(), lezart: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    try {
      const sirhely = await prisma.sirhely.update({ where: { id }, data: parsed.data });
      return sirhely;
    } catch {
      return reply.code(400).send({ error: "Már létezik ilyen jelzésű sírhely ebben a parcellában" });
    }
  });

  app.delete("/api/temeto/sirhelyek/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const gyulekezetId = await assertCanEditSirhely(req.currentUser!, id);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });
    await prisma.sirhely.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---------- Temetés ----------

  // Új temetés rögzítése. A parcella és a sírhely a jelzésük alapján automatikusan létrejön,
  // ha még nem léteznek - így egy kis gyülekezet a teljes fa előzetes felépítése nélkül,
  // egyetlen lépésben rögzítheti a temetést.
  app.post("/api/temeto/burials", async (req, reply) => {
    const schema = z.object({
      personId: z.string(),
      cemeteryId: z.string(),
      parcellaJelzes: z.string().min(1),
      sirhelyJelzes: z.string().min(1),
      datuma: z.string(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const cemetery = await prisma.cemetery.findUnique({ where: { id: parsed.data.cemeteryId } });
    if (!cemetery) return reply.code(404).send({ error: "Nem található temető" });

    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person) return reply.code(404).send({ error: "Nem található személy" });
    if (person.gyulekezetId !== cemetery.gyulekezetId) {
      return reply.code(400).send({ error: "A személy nem ehhez a gyülekezethez tartozik" });
    }

    const existingBurial = await prisma.burial.findUnique({ where: { personId: person.id } });
    if (existingBurial) return reply.code(400).send({ error: "Ennek a személynek már van rögzített temetése" });

    const parcella = await prisma.parcella.upsert({
      where: { cemeteryId_jelzes: { cemeteryId: parsed.data.cemeteryId, jelzes: parsed.data.parcellaJelzes } },
      create: { cemeteryId: parsed.data.cemeteryId, jelzes: parsed.data.parcellaJelzes },
      update: {},
    });
    const sirhely = await prisma.sirhely.upsert({
      where: { parcellaId_jelzes: { parcellaId: parcella.id, jelzes: parsed.data.sirhelyJelzes } },
      create: { parcellaId: parcella.id, jelzes: parsed.data.sirhelyJelzes },
      update: {},
    });

    const datuma = new Date(parsed.data.datuma);
    const burial = await prisma.burial.create({
      data: { personId: person.id, sirhelyId: sirhely.id, datuma },
    });

    // A temetés rögzítése önmagában is elhalálozást jelent - ha a személy még nincs
    // elhunytként jelölve, itt jelöljük meg (a halál dátumát külön is lehet pontosítani
    // a személy adatlapján, ha eltér a temetés dátumától).
    if (!person.elhunyt) {
      await prisma.person.update({ where: { id: person.id }, data: { elhunyt: true, elhunytDatuma: datuma } });
      await applyWidowhoodCascade(person.id, datuma);
    }

    return burial;
  });

  app.put("/api/temeto/burials/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.burial.findUnique({ where: { id }, select: { sirhely: { select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.sirhely.parcella.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({ datuma: z.string().optional(), sirhelyId: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const burial = await prisma.burial.update({
      where: { id },
      data: {
        ...(parsed.data.datuma !== undefined ? { datuma: new Date(parsed.data.datuma) } : {}),
        ...(parsed.data.sirhelyId !== undefined ? { sirhelyId: parsed.data.sirhelyId } : {}),
      },
    });
    return burial;
  });

  app.delete("/api/temeto/burials/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.burial.findUnique({ where: { id }, select: { sirhely: { select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.sirhely.parcella.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.burial.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---------- Sírhelymegváltás ----------

  app.post("/api/temeto/grave-purchases", async (req, reply) => {
    const schema = z.object({
      sirhelyId: z.string(),
      megvaltoNeve: z.string().min(1),
      megvaltoPersonId: z.string().optional().nullable(),
      datuma: z.string(),
      osszeg: z.number().nonnegative().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const gyulekezetId = await assertCanEditSirhely(req.currentUser!, parsed.data.sirhelyId);
    if (!gyulekezetId) return reply.code(403).send({ error: "Nincs jogosultság" });

    const datuma = new Date(parsed.data.datuma);
    const priceConfig = await getGravePriceForYear(gyulekezetId, datuma.getFullYear());
    if (!priceConfig && parsed.data.osszeg === undefined) {
      return reply.code(400).send({ error: "Nincs beállítva sírhelyár erre az évre - adja meg az összeget kézzel" });
    }
    const osszeg = parsed.data.osszeg ?? Number(priceConfig!.osszeg);
    const ervenyessegEv = priceConfig?.ervenyessegEv ?? 25;
    const lejarat = new Date(datuma);
    lejarat.setFullYear(lejarat.getFullYear() + ervenyessegEv);

    const purchase = await prisma.gravePurchase.create({
      data: {
        sirhelyId: parsed.data.sirhelyId,
        megvaltoNeve: parsed.data.megvaltoNeve,
        megvaltoPersonId: parsed.data.megvaltoPersonId ?? null,
        datuma,
        osszeg,
        lejarat,
      },
    });
    return purchase;
  });

  app.put("/api/temeto/grave-purchases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.gravePurchase.findUnique({ where: { id }, select: { sirhely: { select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.sirhely.parcella.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({
      megvaltoNeve: z.string().min(1).optional(),
      megvaltoPersonId: z.string().optional().nullable(),
      datuma: z.string().optional(),
      osszeg: z.number().nonnegative().optional(),
      lejarat: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const purchase = await prisma.gravePurchase.update({
      where: { id },
      data: {
        ...(parsed.data.megvaltoNeve !== undefined ? { megvaltoNeve: parsed.data.megvaltoNeve } : {}),
        ...(parsed.data.megvaltoPersonId !== undefined ? { megvaltoPersonId: parsed.data.megvaltoPersonId } : {}),
        ...(parsed.data.datuma !== undefined ? { datuma: new Date(parsed.data.datuma) } : {}),
        ...(parsed.data.osszeg !== undefined ? { osszeg: parsed.data.osszeg } : {}),
        ...(parsed.data.lejarat !== undefined ? { lejarat: new Date(parsed.data.lejarat) } : {}),
      },
    });
    return purchase;
  });

  app.delete("/api/temeto/grave-purchases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.gravePurchase.findUnique({ where: { id }, select: { sirhely: { select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } } } } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.sirhely.parcella.cemetery.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.gravePurchase.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
