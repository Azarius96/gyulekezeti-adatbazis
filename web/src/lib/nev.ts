/** Egy személy megjelenítendő neve: nőknél a leánykori név zárójelben a név mellett (ha meg van adva). */
export function szemelyNev(p: { vezeteknev: string; keresztnev: string; leanykoriNev?: string | null }): string {
  const leany = p.leanykoriNev?.trim();
  return `${p.vezeteknev} ${p.keresztnev}${leany ? ` (${leany})` : ""}`;
}
