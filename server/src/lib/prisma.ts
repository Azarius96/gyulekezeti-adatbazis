import { PrismaClient } from "@prisma/client";
import { getCurrentActor } from "./requestContext.js";

/**
 * VÁLTOZÁS-TÖRTÉNET (AUDIT NAPLÓ) ÉS "PAPÍRKOSÁR" (SOFT DELETE)
 * ================================================================
 * A cél: évtizedekre visszamenőleg mindig kiderüljön, KI, MIKOR, MIT változtatott - és egy
 * törlés soha ne legyen véglegesen visszavonhatatlan tévedés vagy elhamarkodott döntés miatt.
 *
 * Ezt egyetlen, minden modellre érvényes Prisma Client Extension valósítja meg, NEM az egyes
 * route-okba szórt, könnyen elfelejthető külön hívásokkal - így egy új mentési útvonal sem
 * felejtheti ki véletlenül a naplózást.
 *
 * - CREATE/UPDATE/UPSERT/DELETE minden auditált modellen automatikusan egy AuditLog sort ír
 *   (ki, mikor, melyik gyülekezetre, mi változott - "előtte"/"utána" állapot).
 * - Azoknál a modelleknél, ahol az adat elvesztése helyrehozhatatlan volna (személyek,
 *   pénzügyi tételek, anyakönyvi/temetői bejegyzések, gyülekezetek), a ".delete()" hívás NEM
 *   valódi SQL törlést végez, hanem a "deletedAt" mezőt állítja be - a sor a papírkosárban
 *   marad, onnan bármikor visszaállítható (ld. trash.routes.ts).
 * - A naplózáshoz és az "előtte" állapot lekérdezéséhez SZÁNDÉKOSAN egy külön, nem kiterjesztett
 *   Prisma-kliens (rawPrisma) példányt használunk - így a naplózás saját írásai nem futtatják
 *   újra önmagukat (végtelen rekurzió elkerülése).
 */

const rawPrisma = new PrismaClient();

/**
 * A kiterjesztés NÉLKÜLI kliens - kizárólag olyan helyeken szabad használni, ahol SZÁNDÉKOSAN a
 * papírkosárban lévő (deletedAt != null) sorokat is látni kell (pl. a papírkosár-visszaállítás
 * először meg kell találja a törölt sort, mielőtt visszaállítaná). Minden más esetben a lenti,
 * kiterjesztett `prisma` exportot kell használni.
 */
export const prismaIncludingDeleted = rawPrisma;

// Amiket érdemes naplózni: a tényleges gyülekezeti/egyházi adat. Szándékosan KIMARADT: User
// (jelszó-hash miatt sosem kerülhet be egy másik táblába érzékeny mezőként), UserCapability,
// Address, ConfirmationClass(Member), Kerulet, Egyhazmegye, AuditLog saját maga - ezek
// szerkezeti/rendszer-adatok, nem az évtizedekig megőrzendő gyülekezeti nyilvántartás része.
const AUDITED_MODELS = new Set([
  "Gyulekezet",
  "Person",
  "Household",
  "HouseholdMember",
  "FamilyLink",
  "Marriage",
  "Baptism",
  "Confirmation",
  "ChurchDuesConfig",
  "DuesPayment",
  "Donation",
  "Position",
  "Cemetery",
  "Parcella",
  "Sirhely",
  "Burial",
  "GravePriceConfig",
  "GravePurchase",
  "MovingRequest",
  "Event",
  "TeendoTeljesites",
  "UserRole",
]);

// Ezeknél a ".delete()" hívás valódi törlés helyett a "deletedAt" mezőt állítja be - a séma
// ezeken a modelleken tartalmaz "deletedAt DateTime?" mezőt (ld. schema.prisma).
export const SOFT_DELETE_MODELS = new Set([
  "Gyulekezet",
  "Person",
  "Marriage",
  "Burial",
  "GravePurchase",
  "DuesPayment",
  "Donation",
  "Cemetery",
  "Parcella",
  "Sirhely",
  "ChurchDuesConfig",
  "GravePriceConfig",
  "User",
]);

function modelDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Decimal/Date mezőket tartalmazó Prisma-objektumot biztonságosan, egyszerű JSON-értékké alakít
 * (a Decimal és a Date is rendelkezik saját toJSON()-nal, ezért a JSON kör mindkettőt helyesen,
 * stringgé alakítva szerializálja) - így az audit-napló Json mezőjébe mindig tiszta adat kerül. */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Egy adott sorhoz tartozó gyülekezet azonosítása - ahol a modellen közvetlenül van
 * `gyulekezetId` (vagy azzal egyenértékű) mező, onnan; ahol csak közvetve (pl. egy Person-on
 * vagy egy Sirhely-lánc mentén), ott egy célzott, olcsó lekérdezéssel. Ha egyik sem
 * alkalmazható (pl. rendszerszintű bejegyzés), null - ilyenkor a változás továbbra is
 * naplózásra kerül, csak a gyülekezet szerinti szűrésben nem fog megjelenni.
 */
export async function resolveGyulekezetId(model: string, row: Record<string, unknown> | null): Promise<string | null> {
  if (!row) return null;
  switch (model) {
    case "Gyulekezet":
      return (row.id as string) ?? null;
    case "Person":
    case "Household":
    case "ChurchDuesConfig":
    case "GravePriceConfig":
    case "Position":
    case "Cemetery":
    case "TeendoTeljesites":
    case "Event":
    case "UserRole":
      return (row.gyulekezetId as string | null) ?? null;
    case "MovingRequest":
      return (row.forrasGyulekezetId as string | null) ?? (row.celGyulekezetId as string | null) ?? null;
    case "DuesPayment":
    case "Donation":
      // ezeknél már eleve tárolva van, melyik gyülekezetnek szólt a befizetés akkor
      return (row.gyulekezetIdEkkor as string | null) ?? null;
    case "Marriage": {
      if (!row.spouseAId) return null;
      const p = await rawPrisma.person.findUnique({ where: { id: row.spouseAId as string }, select: { gyulekezetId: true } });
      return p?.gyulekezetId ?? null;
    }
    case "Baptism":
    case "Confirmation":
    case "Burial":
    case "HouseholdMember": {
      const personId = (row.personId as string | undefined) ?? undefined;
      if (!personId) return null;
      const p = await rawPrisma.person.findUnique({ where: { id: personId }, select: { gyulekezetId: true } });
      return p?.gyulekezetId ?? null;
    }
    case "FamilyLink": {
      const parentId = row.parentId as string | undefined;
      if (!parentId) return null;
      const p = await rawPrisma.person.findUnique({ where: { id: parentId }, select: { gyulekezetId: true } });
      return p?.gyulekezetId ?? null;
    }
    case "Parcella": {
      const cemeteryId = row.cemeteryId as string | undefined;
      if (!cemeteryId) return null;
      const c = await rawPrisma.cemetery.findUnique({ where: { id: cemeteryId }, select: { gyulekezetId: true } });
      return c?.gyulekezetId ?? null;
    }
    case "Sirhely": {
      const parcellaId = row.parcellaId as string | undefined;
      if (!parcellaId) return null;
      const p = await rawPrisma.parcella.findUnique({ where: { id: parcellaId }, select: { cemetery: { select: { gyulekezetId: true } } } });
      return p?.cemetery.gyulekezetId ?? null;
    }
    case "GravePurchase": {
      const sirhelyId = row.sirhelyId as string | undefined;
      if (!sirhelyId) return null;
      const s = await rawPrisma.sirhely.findUnique({
        where: { id: sirhelyId },
        select: { parcella: { select: { cemetery: { select: { gyulekezetId: true } } } } },
      });
      return s?.parcella.cemetery.gyulekezetId ?? null;
    }
    default:
      return null;
  }
}

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

async function writeAuditLog(params: {
  action: AuditAction;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}) {
  try {
    const actor = getCurrentActor();
    const gyulekezetId = await resolveGyulekezetId(params.entity, (params.after ?? params.before) as Record<string, unknown> | null);
    await rawPrisma.auditLog.create({
      data: {
        userId: actor?.userId ?? null,
        userNev: actor?.userNev ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        gyulekezetId,
        before: toJsonSafe(params.before) as never,
        after: toJsonSafe(params.after) as never,
      },
    });
  } catch (err) {
    // Az audit-naplózás meghiúsulása SOHA nem buktathatja el a tényleges (üzleti) műveletet -
    // egy hiányzó naplósor kellemetlen, de egy emiatt elszálló mentés sokkal rosszabb lenne.
    // eslint-disable-next-line no-console
    console.error("Audit napló írása sikertelen:", err);
  }
}

function isSoftDeleteToggle(model: string, data: unknown): "DELETE" | "RESTORE" | null {
  if (!SOFT_DELETE_MODELS.has(model) || !data || typeof data !== "object" || !("deletedAt" in (data as Record<string, unknown>))) {
    return null;
  }
  const value = (data as Record<string, unknown>).deletedAt;
  if (value === null) return "RESTORE";
  return "DELETE";
}

/**
 * Egy olvasó lekérdezés ("where") alapértelmezetten kizárja a papírkosárba került (deletedAt !=
 * null) sorokat a 12 "puha törlős" modellen - KIVÉVE, ha a hívó már maga is explicit döntött a
 * "deletedAt" mezőről (pl. a papírkosár-listázás szándékosan a törölteket kéri). Így egy törölt
 * személy/befizetés/stb. sehol nem bukkanhat fel véletlenül a normál listákban, anélkül, hogy
 * minden egyes route-ban külön kellene erre figyelni.
 */
function excludeDeletedByDefault(model: string, args: Record<string, unknown> | undefined): Record<string, unknown> {
  const safeArgs = args ?? {};
  if (!SOFT_DELETE_MODELS.has(model)) return safeArgs;
  const where = (safeArgs.where as Record<string, unknown> | undefined) ?? {};
  if (Object.prototype.hasOwnProperty.call(where, "deletedAt")) return safeArgs;
  return { ...safeArgs, where: { ...where, deletedAt: null } };
}

export const prisma = rawPrisma.$extends({
  name: "auditLogExtension",
  query: {
    $allModels: {
      findUnique({ model, args, query }) {
        return query(excludeDeletedByDefault(model, args) as never);
      },
      findFirst({ model, args, query }) {
        return query(excludeDeletedByDefault(model, args) as never);
      },
      findMany({ model, args, query }) {
        return query(excludeDeletedByDefault(model, args) as never);
      },
      count({ model, args, query }) {
        return query(excludeDeletedByDefault(model, args) as never);
      },
      aggregate({ model, args, query }) {
        return query(excludeDeletedByDefault(model, args) as never);
      },
      async create({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          await writeAuditLog({
            action: "CREATE",
            entity: model,
            entityId: (result as Record<string, unknown> | null)?.id as string | null,
            before: null,
            after: result,
          });
        }
        return result;
      },
      async update({ model, args, query }) {
        const audited = AUDITED_MODELS.has(model);
        const before = audited
          ? await (rawPrisma as Record<string, any>)[modelDelegateName(model)]
              .findUnique({ where: args.where })
              .catch(() => null)
          : null;
        const result = await query(args);
        if (audited) {
          const toggle = isSoftDeleteToggle(model, (args as { data?: unknown }).data);
          const action: AuditAction = toggle ?? "UPDATE";
          await writeAuditLog({
            action,
            entity: model,
            entityId: ((result as Record<string, unknown> | null)?.id as string | undefined) ?? ((args.where as Record<string, unknown>)?.id as string | undefined) ?? null,
            before,
            after: result,
          });
        }
        return result;
      },
      async upsert({ model, args, query }) {
        const audited = AUDITED_MODELS.has(model);
        const before = audited
          ? await (rawPrisma as Record<string, any>)[modelDelegateName(model)]
              .findUnique({ where: args.where })
              .catch(() => null)
          : null;
        const result = await query(args);
        if (audited) {
          await writeAuditLog({
            action: before ? "UPDATE" : "CREATE",
            entity: model,
            entityId: (result as Record<string, unknown> | null)?.id as string | null,
            before,
            after: result,
          });
        }
        return result;
      },
      async delete({ model, args, query }) {
        const audited = AUDITED_MODELS.has(model);
        const before = audited
          ? await (rawPrisma as Record<string, any>)[modelDelegateName(model)]
              .findUnique({ where: args.where })
              .catch(() => null)
          : null;
        const result = await query(args);
        if (audited) {
          await writeAuditLog({
            action: "DELETE",
            entity: model,
            entityId:
              ((result as Record<string, unknown> | null)?.id as string | undefined) ??
              ((before as Record<string, unknown> | null)?.id as string | undefined) ??
              null,
            before,
            after: null,
          });
        }
        return result;
      },
    },
  },
});
