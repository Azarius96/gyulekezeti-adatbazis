import type { FastifyInstance } from "fastify";
import { prisma, prismaIncludingDeleted, resolveGyulekezetId } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, isAdmin } from "../auth/scope.js";

/**
 * PAPÍRKOSÁR
 * ===========
 * A törölt (deletedAt != null) sorok listázása és visszaállítása. A tényleges "puha törlést" maga
 * a Prisma-kiterjesztés (lib/prisma.ts) valósítja meg - ".delete()" hívásra a rendszer nem SQL
 * DELETE-et futtat az auditált modelleken, hanem a deletedAt mezőt állítja be, így a sor (minden
 * kapcsolódó adatával, kaszkád nélkül) a helyén marad, és innen visszaállítható.
 *
 * A listázás megtekintési jogosultsághoz kötött (egy esperes a saját egyházmegyéje törölt
 * elemeit is látja), a visszaállítás viszont csak szerkesztési joggal - összhangban azzal, hogy
 * egy esperes más gyülekezet adatát megnézheti, de nem módosíthatja.
 */

interface TrashItem {
  entity: string;
  id: string;
  deletedAt: string;
  label: string;
  gyulekezetId: string | null;
  gyulekezetNev: string | null;
}

async function listTrash(accessible: string[] | "ALL"): Promise<TrashItem[]> {
  const gyulekezetFilter = accessible === "ALL" ? undefined : { in: accessible };
  const items: TrashItem[] = [];

  const gyulekezetek = await prisma.gyulekezet.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { id: gyulekezetFilter } : {}) },
  });
  for (const g of gyulekezetek) {
    items.push({ entity: "Gyulekezet", id: g.id, deletedAt: g.deletedAt!.toISOString(), label: g.nev, gyulekezetId: g.id, gyulekezetNev: g.nev });
  }

  const persons = await prisma.person.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetId: gyulekezetFilter } : {}) },
    include: { gyulekezet: { select: { nev: true } } },
  });
  for (const p of persons) {
    items.push({
      entity: "Person",
      id: p.id,
      deletedAt: p.deletedAt!.toISOString(),
      label: `${p.vezeteknev} ${p.keresztnev}`,
      gyulekezetId: p.gyulekezetId,
      gyulekezetNev: p.gyulekezet.nev,
    });
  }

  const marriages = await prisma.marriage.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { spouseA: { gyulekezetId: gyulekezetFilter } } : {}) },
    include: {
      spouseA: { select: { vezeteknev: true, keresztnev: true, gyulekezetId: true, gyulekezet: { select: { nev: true } } } },
      spouseB: { select: { vezeteknev: true, keresztnev: true } },
    },
  });
  for (const m of marriages) {
    const bNev = m.spouseB ? `${m.spouseB.vezeteknev} ${m.spouseB.keresztnev}` : m.kulsoHazastarsNeve ?? "?";
    items.push({
      entity: "Marriage",
      id: m.id,
      deletedAt: m.deletedAt!.toISOString(),
      label: `${m.spouseA.vezeteknev} ${m.spouseA.keresztnev} ∞ ${bNev}`,
      gyulekezetId: m.spouseA.gyulekezetId,
      gyulekezetNev: m.spouseA.gyulekezet.nev,
    });
  }

  const burials = await prisma.burial.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { person: { gyulekezetId: gyulekezetFilter } } : {}) },
    include: { person: { select: { vezeteknev: true, keresztnev: true, gyulekezetId: true, gyulekezet: { select: { nev: true } } } } },
  });
  for (const b of burials) {
    items.push({
      entity: "Burial",
      id: b.id,
      deletedAt: b.deletedAt!.toISOString(),
      label: `${b.person.vezeteknev} ${b.person.keresztnev} temetése`,
      gyulekezetId: b.person.gyulekezetId,
      gyulekezetNev: b.person.gyulekezet.nev,
    });
  }

  const gravePurchases = await prisma.gravePurchase.findMany({
    where: {
      deletedAt: { not: null },
      ...(gyulekezetFilter ? { sirhely: { parcella: { cemetery: { gyulekezetId: gyulekezetFilter } } } } : {}),
    },
    include: { sirhely: { include: { parcella: { include: { cemetery: { select: { gyulekezetId: true, nev: true } } } } } } },
  });
  for (const gp of gravePurchases) {
    items.push({
      entity: "GravePurchase",
      id: gp.id,
      deletedAt: gp.deletedAt!.toISOString(),
      label: `Sírhely-megváltás - ${gp.megvaltoNeve}`,
      gyulekezetId: gp.sirhely.parcella.cemetery.gyulekezetId,
      gyulekezetNev: gp.sirhely.parcella.cemetery.nev,
    });
  }

  const duesPayments = await prisma.duesPayment.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetIdEkkor: gyulekezetFilter } : {}) },
    include: { person: { select: { vezeteknev: true, keresztnev: true } } },
  });
  const duesGyulekezetek = new Map(
    (
      await prisma.gyulekezet.findMany({ where: { id: { in: Array.from(new Set(duesPayments.map((d) => d.gyulekezetIdEkkor))) } }, select: { id: true, nev: true } })
    ).map((g) => [g.id, g.nev])
  );
  for (const d of duesPayments) {
    items.push({
      entity: "DuesPayment",
      id: d.id,
      deletedAt: d.deletedAt!.toISOString(),
      label: `Egyházfenntartó befizetés - ${d.person.vezeteknev} ${d.person.keresztnev} (${d.ev}, ${d.osszeg} lej)`,
      gyulekezetId: d.gyulekezetIdEkkor,
      gyulekezetNev: duesGyulekezetek.get(d.gyulekezetIdEkkor) ?? null,
    });
  }

  const donations = await prisma.donation.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetIdEkkor: gyulekezetFilter } : {}) },
    include: { person: { select: { vezeteknev: true, keresztnev: true } } },
  });
  const donationGyulekezetek = new Map(
    (
      await prisma.gyulekezet.findMany({ where: { id: { in: Array.from(new Set(donations.map((d) => d.gyulekezetIdEkkor))) } }, select: { id: true, nev: true } })
    ).map((g) => [g.id, g.nev])
  );
  for (const d of donations) {
    items.push({
      entity: "Donation",
      id: d.id,
      deletedAt: d.deletedAt!.toISOString(),
      label: `Adomány - ${d.person.vezeteknev} ${d.person.keresztnev} (${d.ev}, ${d.osszeg} lej)`,
      gyulekezetId: d.gyulekezetIdEkkor,
      gyulekezetNev: donationGyulekezetek.get(d.gyulekezetIdEkkor) ?? null,
    });
  }

  const cemeteries = await prisma.cemetery.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetId: gyulekezetFilter } : {}) },
    include: { gyulekezet: { select: { nev: true } } },
  });
  for (const c of cemeteries) {
    items.push({ entity: "Cemetery", id: c.id, deletedAt: c.deletedAt!.toISOString(), label: c.nev, gyulekezetId: c.gyulekezetId, gyulekezetNev: c.gyulekezet.nev });
  }

  const parcellak = await prisma.parcella.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { cemetery: { gyulekezetId: gyulekezetFilter } } : {}) },
    include: { cemetery: { select: { gyulekezetId: true, nev: true } } },
  });
  for (const p of parcellak) {
    items.push({
      entity: "Parcella",
      id: p.id,
      deletedAt: p.deletedAt!.toISOString(),
      label: `${p.jelzes} (${p.cemetery.nev})`,
      gyulekezetId: p.cemetery.gyulekezetId,
      gyulekezetNev: p.cemetery.nev,
    });
  }

  const sirhelyek = await prisma.sirhely.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { parcella: { cemetery: { gyulekezetId: gyulekezetFilter } } } : {}) },
    include: { parcella: { include: { cemetery: { select: { gyulekezetId: true, nev: true } } } } },
  });
  for (const s of sirhelyek) {
    items.push({
      entity: "Sirhely",
      id: s.id,
      deletedAt: s.deletedAt!.toISOString(),
      label: `${s.jelzes} (${s.parcella.cemetery.nev})`,
      gyulekezetId: s.parcella.cemetery.gyulekezetId,
      gyulekezetNev: s.parcella.cemetery.nev,
    });
  }

  const duesConfigs = await prisma.churchDuesConfig.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetId: gyulekezetFilter } : {}) },
    include: { gyulekezet: { select: { nev: true } } },
  });
  for (const c of duesConfigs) {
    items.push({
      entity: "ChurchDuesConfig",
      id: c.id,
      deletedAt: c.deletedAt!.toISOString(),
      label: `Egyházfenntartói korsáv ${c.korhatarTol}-${c.korhatarIg} év, ${c.osszeg} lej (${c.ervenyesEttolEv}-től)`,
      gyulekezetId: c.gyulekezetId,
      gyulekezetNev: c.gyulekezet.nev,
    });
  }

  const gravePriceConfigs = await prisma.gravePriceConfig.findMany({
    where: { deletedAt: { not: null }, ...(gyulekezetFilter ? { gyulekezetId: gyulekezetFilter } : {}) },
    include: { gyulekezet: { select: { nev: true } } },
  });
  for (const c of gravePriceConfigs) {
    items.push({
      entity: "GravePriceConfig",
      id: c.id,
      deletedAt: c.deletedAt!.toISOString(),
      label: `Sírhely-ár ${c.osszeg} lej (${c.ervenyesEttolEv}-től)`,
      gyulekezetId: c.gyulekezetId,
      gyulekezetNev: c.gyulekezet.nev,
    });
  }

  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return items;
}

const RESTORABLE_MODEL_DELEGATE: Record<string, string> = {
  Gyulekezet: "gyulekezet",
  Person: "person",
  Marriage: "marriage",
  Burial: "burial",
  GravePurchase: "gravePurchase",
  DuesPayment: "duesPayment",
  Donation: "donation",
  Cemetery: "cemetery",
  Parcella: "parcella",
  Sirhely: "sirhely",
  ChurchDuesConfig: "churchDuesConfig",
  GravePriceConfig: "gravePriceConfig",
};

export async function trashRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/trash", async (req) => {
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    return { items: await listTrash(accessible) };
  });

  app.post("/api/trash/:entity/:id/restore", async (req, reply) => {
    const { entity, id } = req.params as { entity: string; id: string };
    const delegate = RESTORABLE_MODEL_DELEGATE[entity];
    if (!delegate) return reply.code(400).send({ error: "Ismeretlen típus" });

    const user = req.currentUser!;
    const row = await (prismaIncludingDeleted as unknown as Record<string, any>)[delegate].findUnique({ where: { id } });
    if (!row) return reply.code(404).send({ error: "Nem található" });
    if (row.deletedAt == null) return reply.code(409).send({ error: "Ez az elem nincs a papírkosárban" });

    const gyulekezetId = await resolveGyulekezetId(entity, row);
    if (!isAdmin(user) && (!gyulekezetId || !canEditGyulekezet(user, gyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const restored = await (prisma as unknown as Record<string, any>)[delegate].update({ where: { id }, data: { deletedAt: null } });
    return restored;
  });
}
