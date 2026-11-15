import { z } from "zod";

/** Nem kötelező szöveges mező (üres szöveg = nincs adat). */
export const optStr = z.string().optional().nullable();

/** Kulcslistából típusos Zod-objektum-sémát készít (minden kulcs nem kötelező szöveg). */
export function szovegesSema<K extends string>(kulcsok: readonly K[]) {
  return z.object(Object.fromEntries(kulcsok.map((k) => [k, optStr])) as Record<K, typeof optStr>);
}

/** A megadott (nem undefined) szöveges mezők tisztítva (üres = null) - létrehozáshoz és módosításhoz is. */
export function szovegesMezok(src: Record<string, unknown>, mezok: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of mezok) {
    const v = src[k];
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return out;
}

/** A megadott (nem undefined) dátum mezők Date-té alakítva (üres = null). */
export function datumMezok(src: Record<string, unknown>, mezok: readonly string[]): Record<string, Date | null> {
  const out: Record<string, Date | null> = {};
  for (const k of mezok) {
    const v = src[k];
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v ? new Date(v) : null;
  }
  return out;
}
