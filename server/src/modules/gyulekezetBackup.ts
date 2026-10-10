import { prisma } from "../lib/prisma.js";
import { createBackup } from "./backup.js";

/**
 * GYÜLEKEZETENKÉNTI (RÉSZLEGES) MENTÉS ÉS VISSZAÁLLÍTÁS
 * ========================================================
 * A teljes adatbázis-mentés (backup.ts) mindig MINDEN gyülekezetet tartalmazza egyszerre - ez a
 * modul egyetlen gyülekezet adatait exportálja külön letölthető JSON fájlba, és képes ugyanabból
 * a fájlból VISSZA is állítani, anélkül, hogy bármelyik másik gyülekezet adatát érintené.
 *
 * A visszaállítás egyetlen adatbázis-tranzakcióban fut: minden, a mentésben szereplő sor
 * felülíródik/létrejön (upsert azonosító szerint), és minden, ami a mentés óta hozzáadva a
 * gyülekezethez de a mentésben nem szerepel, eltávolításra kerül - a "puha törlős" (papírkosaras)
 * modelleken ez is csak a deletedAt beállítását jelenti, sosem végleges törlést. Ha bármelyik lépés
 * hibába ütközik, az EGÉSZ tranzakció visszagördül - tehát vagy teljesen sikerül, vagy semmi sem
 * változik. A visszaállítás előtt mindig készül egy teljes adatbázis-mentés is (ugyanaz a
 * biztonsági háló, mint a teljes visszaállításnál), hogy egy váratlan hiba esetén is mindig legyen
 * visszaút.
 */

interface TableConfig {
  key: string;
  delegate: string;
  softDelete: boolean;
  scopeWhere: (gyulekezetId: string) => Record<string, unknown>;
}

// Szigorú függőségi sorrendben (szülő a gyermek előtt) - a visszaállítás felfelé (upsert) ebben a
// sorrendben, a mentés óta hozzáadott, mentésben nem szereplő sorok eltávolítása pedig FORDÍTOTT
// sorrendben fut, hogy sose ütközzön idegen kulcs -megszorításba.
const TABLES: TableConfig[] = [
  { key: "households", delegate: "household", softDelete: false, scopeWhere: (id) => ({ gyulekezetId: id }) },
  // a kiköltözött (elkoltozott) tagok is a mentés részei, ezért az alapértelmezett szűrést explicit felülírjuk
  { key: "persons", delegate: "person", softDelete: true, scopeWhere: (id) => ({ gyulekezetId: id, elkoltozott: { in: [true, false] } }) },
  { key: "householdMembers", delegate: "householdMember", softDelete: false, scopeWhere: (id) => ({ household: { gyulekezetId: id } }) },
  { key: "familyLinks", delegate: "familyLink", softDelete: false, scopeWhere: (id) => ({ parent: { gyulekezetId: id } }) },
  { key: "marriages", delegate: "marriage", softDelete: true, scopeWhere: (id) => ({ spouseA: { gyulekezetId: id } }) },
  { key: "baptisms", delegate: "baptism", softDelete: false, scopeWhere: (id) => ({ person: { gyulekezetId: id } }) },
  { key: "confirmations", delegate: "confirmation", softDelete: false, scopeWhere: (id) => ({ person: { gyulekezetId: id } }) },
  { key: "churchDuesConfigs", delegate: "churchDuesConfig", softDelete: true, scopeWhere: (id) => ({ gyulekezetId: id }) },
  { key: "duesPayments", delegate: "duesPayment", softDelete: true, scopeWhere: (id) => ({ gyulekezetIdEkkor: id }) },
  { key: "donations", delegate: "donation", softDelete: true, scopeWhere: (id) => ({ gyulekezetIdEkkor: id }) },
  { key: "positions", delegate: "position", softDelete: false, scopeWhere: (id) => ({ gyulekezetId: id }) },
  { key: "cemeteries", delegate: "cemetery", softDelete: true, scopeWhere: (id) => ({ gyulekezetId: id }) },
  { key: "parcellak", delegate: "parcella", softDelete: true, scopeWhere: (id) => ({ cemetery: { gyulekezetId: id } }) },
  { key: "sirhelyek", delegate: "sirhely", softDelete: true, scopeWhere: (id) => ({ parcella: { cemetery: { gyulekezetId: id } } }) },
  { key: "burials", delegate: "burial", softDelete: true, scopeWhere: (id) => ({ person: { gyulekezetId: id } }) },
  { key: "gravePriceConfigs", delegate: "gravePriceConfig", softDelete: true, scopeWhere: (id) => ({ gyulekezetId: id }) },
  { key: "gravePurchases", delegate: "gravePurchase", softDelete: true, scopeWhere: (id) => ({ sirhely: { parcella: { cemetery: { gyulekezetId: id } } } }) },
  { key: "movingRequests", delegate: "movingRequest", softDelete: false, scopeWhere: (id) => ({ person: { gyulekezetId: id } }) },
  { key: "events", delegate: "event", softDelete: false, scopeWhere: (id) => ({ gyulekezetId: id }) },
  { key: "teendoTeljesitesek", delegate: "teendoTeljesites", softDelete: false, scopeWhere: (id) => ({ gyulekezetId: id }) },
];

const FORMAT_VERSION = 1;

interface GyulekezetSnapshot {
  formatVersion: number;
  gyulekezetId: string;
  gyulekezetNev: string;
  exportedAt: string;
  data: Record<string, Record<string, unknown>[]>;
}

function p(): Record<string, any> {
  return prisma as unknown as Record<string, any>;
}

export async function exportGyulekezetData(gyulekezetId: string): Promise<GyulekezetSnapshot> {
  const gyulekezet = await prisma.gyulekezet.findUnique({ where: { id: gyulekezetId } });
  if (!gyulekezet) throw new Error("Nem található gyülekezet");

  const data: Record<string, Record<string, unknown>[]> = { gyulekezet: [gyulekezet] };

  for (const table of TABLES) {
    data[table.key] = await p()[table.delegate].findMany({ where: table.scopeWhere(gyulekezetId) });
  }

  const households = data.households as { addressId: string }[];
  const addressIds = Array.from(new Set(households.map((h) => h.addressId)));
  data.addresses = addressIds.length ? await prisma.address.findMany({ where: { id: { in: addressIds } } }) : [];

  return {
    formatVersion: FORMAT_VERSION,
    gyulekezetId,
    gyulekezetNev: gyulekezet.nev,
    exportedAt: new Date().toISOString(),
    data,
  };
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A JSON nem ismeri a Date típust - visszafelé az ISO-időbélyegnek kinéző string mezőket valódi
 * Date objektummá alakítjuk, hogy a Prisma DateTime mezőin ugyanúgy elfogadja őket, mint eredetileg. */
function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === "string" && ISO_DATETIME_RE.test(value)) return new Date(value);
  return value;
}

export function parseGyulekezetSnapshot(buffer: Buffer): GyulekezetSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf-8"), reviveDates);
  } catch {
    throw new Error("A fájl nem érvényes JSON gyülekezet-mentés");
  }
  const snap = parsed as Partial<GyulekezetSnapshot>;
  if (!snap || snap.formatVersion !== FORMAT_VERSION || typeof snap.gyulekezetId !== "string" || !snap.data) {
    throw new Error("A fájl nem érvényes vagy nem támogatott formátumú gyülekezet-mentés");
  }
  return snap as GyulekezetSnapshot;
}

/**
 * Visszaállítja EGY gyülekezet adatait a megadott mentésből - minden más gyülekezet érintetlen
 * marad. Előtte mindig készül egy teljes adatbázis-mentés (ugyanaz a biztonsági háló, mint a
 * teljes visszaállításnál), utána minden a mentésben szereplő sor upsert-elődik (létrehozva vagy
 * felülírva), a mentés óta hozzáadott, de a mentésben nem szereplő sorok pedig eltávolításra
 * kerülnek (a papírkosaras modelleken csak "törölt" jelöléssel, sosem véglegesen).
 */
export async function restoreGyulekezetData(
  gyulekezetId: string,
  snapshot: GyulekezetSnapshot
): Promise<{ preRestoreBackup: Awaited<ReturnType<typeof createBackup>> }> {
  if (snapshot.gyulekezetId !== gyulekezetId) {
    throw new Error(
      "A feltöltött mentés egy másik gyülekezethez tartozik - csak ugyanahhoz a gyülekezethez készült mentés állítható vissza"
    );
  }

  const preRestoreBackup = await createBackup("pre-restore");

  await prisma.$transaction(
    async (tx) => {
      const t = tx as unknown as Record<string, any>;

      const gyulekezetRow = snapshot.data.gyulekezet?.[0];
      if (gyulekezetRow) {
        const { id: _id, ...fields } = gyulekezetRow as { id: string; [k: string]: unknown };
        await t.gyulekezet.update({ where: { id: gyulekezetId }, data: fields });
      }

      for (const addr of snapshot.data.addresses ?? []) {
        const row = addr as { id: string };
        await t.address.upsert({ where: { id: row.id }, create: row, update: row });
      }

      for (const table of TABLES) {
        for (const row of snapshot.data[table.key] ?? []) {
          const r = row as { id: string };
          await t[table.delegate].upsert({ where: { id: r.id }, create: r, update: r });
        }
      }

      for (const table of [...TABLES].reverse()) {
        const currentRows: { id: string }[] = await t[table.delegate].findMany({
          where: table.scopeWhere(gyulekezetId),
          select: { id: true },
        });
        const snapshotIds = new Set((snapshot.data[table.key] ?? []).map((r) => (r as { id: string }).id));
        const extraneousIds = currentRows.map((r) => r.id).filter((id) => !snapshotIds.has(id));
        for (const id of extraneousIds) {
          if (table.softDelete) {
            await t[table.delegate].update({ where: { id }, data: { deletedAt: new Date() } });
          } else {
            await t[table.delegate].delete({ where: { id } });
          }
        }
      }
    },
    { timeout: 60_000 }
  );

  return { preRestoreBackup };
}
