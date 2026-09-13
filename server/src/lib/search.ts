/**
 * Több szavas névkeresés: a "Szollosi Arpad" keresés helyesen találja meg azt a
 * személyt, akinek vezetékneve "Szollosi", keresztneve "Arpad" (külön mezők) - anélkül,
 * hogy bármelyik mező önmagában tartalmazná a teljes "Szollosi Arpad" karakterláncot.
 * Minden szónak illeszkednie kell VALAMELYIK megadott mezőre (szavak között ÉS,
 * mezők között VAGY), a szavak sorrendje nem számít ("Arpad Szollosi" is talál).
 */
export function splitSearchWords(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

/**
 * Ékezetek levágása (pl. "Szabó" -> "szabo"), hogy a keresés ékezet-független legyen -
 * a felhasználó akkor is megtalálja a találatot, ha a keresőszót ékezetek nélkül gépeli be.
 * NFD felbontás szétválasztja a betűt és a rááhelyezett ékezetjelet (kombináló diakritikus
 * jel, U+0300-U+036F), amit aztán egyszerűen eldobunk.
 */
function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Ugyanez memóriában (már betöltött objektumokra) - a szűrés ékezet- és kis/nagybetű-független.
 * A DB-szintű `contains` (ILIKE) ékezet-érzékeny lenne, ezért a névkeresést szándékosan itt,
 * a már lekérdezett (és a gyülekezet-hozzáférés szerint amúgy is korlátozott méretű) listán
 * végezzük, nem az adatbázisban.
 */
export function matchesAllWords(values: (string | null | undefined)[], q: string): boolean {
  const words = splitSearchWords(foldDiacritics(q.toLowerCase()));
  const haystacks = values.filter((v): v is string => !!v).map((v) => foldDiacritics(v.toLowerCase()));
  return words.every((word) => haystacks.some((v) => v.includes(word)));
}
