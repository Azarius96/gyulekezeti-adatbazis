import { prisma } from "../lib/prisma.js";

const PREFIXES = new Set(["id", "ifj", "ozv", "özv"]);

export function normalizeName(vezeteknev: string, keresztnev: string): string {
  const full = `${vezeteknev} ${keresztnev}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = full
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !PREFIXES.has(t.replace(/\.$/, "")));
  return tokens.join(" ");
}

export type DuplicateVerdict = "EXACT" | "UNCERTAIN" | "NONE";

export interface DuplicateMatch {
  verdict: DuplicateVerdict;
  match?: { id: string; vezeteknev: string; keresztnev: string; szuletesiDatum: Date | null };
}

/**
 * Az azonos gyülekezetben már létező, hasonló nevű személyeket keresi.
 * Csak akkor tekinti biztos duplikátumnak, ha a normalizált név ÉS a születési év is egyezik —
 * azonos név önmagában nem elég, mert két különböző személy is viselheti ugyanazt a nevet.
 */
export async function checkDuplicate(
  gyulekezetId: string,
  vezeteknev: string,
  keresztnev: string,
  szuletesiDatum: Date | null
): Promise<DuplicateMatch> {
  const target = normalizeName(vezeteknev, keresztnev);
  const candidates = await prisma.person.findMany({
    where: { gyulekezetId },
    select: { id: true, vezeteknev: true, keresztnev: true, szuletesiDatum: true },
  });

  const nameMatches = candidates.filter((c) => normalizeName(c.vezeteknev, c.keresztnev) === target);
  if (nameMatches.length === 0) return { verdict: "NONE" };

  if (szuletesiDatum) {
    const exact = nameMatches.find(
      (c) => c.szuletesiDatum && c.szuletesiDatum.getFullYear() === szuletesiDatum.getFullYear()
    );
    if (exact) return { verdict: "EXACT", match: exact };
  }

  return { verdict: "UNCERTAIN", match: nameMatches[0] };
}
