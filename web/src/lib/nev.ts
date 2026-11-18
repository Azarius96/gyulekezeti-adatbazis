/** Egy személy megjelenítendő neve: nőknél a leánykori név zárójelben a név mellett (ha meg van adva). */
export function szemelyNev(p: { vezeteknev: string; keresztnev: string; leanykoriNev?: string | null }): string {
  const leany = p.leanykoriNev?.trim();
  return `${p.vezeteknev} ${p.keresztnev}${leany ? ` (${leany})` : ""}`;
}

/** Születési sorrend: a legidősebb elöl, a legfiatalabb a végén; akinek nincs születési dátuma, a végére kerül (azonos dátumnál név szerint). */
export function szuletesiSorrend<T>(lista: T[], datum: (x: T) => string | null | undefined, nev: (x: T) => string = () => ""): T[] {
  return [...lista].sort((a, b) => {
    const x = datum(a) ? new Date(datum(a)!).getTime() : Infinity;
    const y = datum(b) ? new Date(datum(b)!).getTime() : Infinity;
    if (x !== y) return x < y ? -1 : 1;
    return nev(a).localeCompare(nev(b), "hu");
  });
}
