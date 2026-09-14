import { prisma } from "../lib/prisma.js";
import type { User, UserRole } from "@prisma/client";

export type AuthUser = User & { roles: UserRole[] };

export function isAdmin(user: AuthUser): boolean {
  return user.roles.some((r) => r.szerepKor === "ADMIN");
}

/**
 * A rendszer üzemeltetőjének (ADMIN szerepkör) fiókja sosem függeszthető fel fizetés hiánya
 * miatt - a fizetési határidő kizárólag a rendszert használó (pl. lelkész) fiókokra vonatkozik.
 */
export function isPaymentExpired(user: AuthUser): boolean {
  if (isAdmin(user)) return false;
  return user.paymentValidUntil != null && user.paymentValidUntil.getTime() < Date.now();
}

/** Igaz, ha a fizetési határidő a megadott napon belül lejár (de még nem járt le) - erre épül a
 * fejlécen megjelenő piros figyelmeztetés. */
export function isPaymentDueSoon(user: AuthUser, withinDays = 30): boolean {
  if (isAdmin(user) || !user.paymentValidUntil) return false;
  const msLeft = user.paymentValidUntil.getTime() - Date.now();
  return msLeft > 0 && msLeft <= withinDays * 24 * 60 * 60 * 1000;
}

/**
 * Visszaadja azon gyülekezet-azonosítók listáját, amelyeket az adott
 * felhasználó VALAMELYIK szerepköre alapján láthat (egy felhasználónak
 * több szerepköre és több gyülekezete/egyházmegyéje is lehet egyszerre).
 * Admin esetén "ALL"-t ad vissza, mert ő korlátozás nélkül mindent lát.
 */
export async function getAccessibleGyulekezetIds(user: AuthUser): Promise<string[] | "ALL"> {
  if (isAdmin(user)) return "ALL";

  const ids = new Set<string>();

  const keruletIds = user.roles.filter((r) => r.szerepKor === "PUSPOK" && r.keruletId).map((r) => r.keruletId!);
  if (keruletIds.length > 0) {
    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: { egyhazmegye: { keruletId: { in: keruletIds } } },
      select: { id: true },
    });
    gyulekezetek.forEach((g) => ids.add(g.id));
  }

  const egyhazmegyeIds = user.roles
    .filter((r) => r.szerepKor === "ESPERES" && r.egyhazmegyeId)
    .map((r) => r.egyhazmegyeId!);
  if (egyhazmegyeIds.length > 0) {
    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: { egyhazmegyeId: { in: egyhazmegyeIds } },
      select: { id: true },
    });
    gyulekezetek.forEach((g) => ids.add(g.id));
  }

  user.roles
    .filter((r) => (r.szerepKor === "LELKESZ" || r.szerepKor === "DELEGALT") && r.gyulekezetId)
    .forEach((r) => ids.add(r.gyulekezetId!));

  return Array.from(ids);
}

export async function canAccessGyulekezet(user: AuthUser, gyulekezetId: string): Promise<boolean> {
  const ids = await getAccessibleGyulekezetIds(user);
  if (ids === "ALL") return true;
  return ids.includes(gyulekezetId);
}

/** Csak ADMIN, PUSPOK, ESPERES olvashat több gyülekezetet; a LELKESZ/DELEGALT csak a sajátjait szerkesztheti. */
export function canEditGyulekezet(user: AuthUser, gyulekezetId: string): boolean {
  if (isAdmin(user)) return true;
  return user.roles.some(
    (r) => (r.szerepKor === "LELKESZ" || r.szerepKor === "DELEGALT") && r.gyulekezetId === gyulekezetId
  );
}

/**
 * Egy adott személyhez kapcsolódó írási művelet (rokoni kapcsolat, házasság, háztartási tagság)
 * csak akkor engedélyezett, ha a felhasználó szerkesztheti a személy gyülekezetét.
 * Enélkül bármely bejelentkezett lelkész módosíthatná más gyülekezetek adatait (IDOR).
 */
export async function assertCanEditPerson(user: AuthUser, personId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { gyulekezetId: true } });
  if (!person) return false;
  return canEditGyulekezet(user, person.gyulekezetId);
}

/**
 * Azok az egyházmegye- és kerület-azonosítók, amelyekhez a felhasználó ESPERES, illetve PUSPOK
 * szerepkörben tartozik - ez alapján dönthető el, mely megyei/kerületi szintre emelt eseményeket
 * hagyhatja jóvá.
 */
export function approvalScope(user: AuthUser): { egyhazmegyeIds: string[]; keruletIds: string[] } {
  return {
    egyhazmegyeIds: user.roles
      .filter((r) => r.szerepKor === "ESPERES" && r.egyhazmegyeId)
      .map((r) => r.egyhazmegyeId!),
    keruletIds: user.roles.filter((r) => r.szerepKor === "PUSPOK" && r.keruletId).map((r) => r.keruletId!),
  };
}
