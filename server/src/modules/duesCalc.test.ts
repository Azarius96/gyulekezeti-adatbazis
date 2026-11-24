import test from "node:test";
import assert from "node:assert/strict";
import { dijKategoria, dijStatisztika, resolveDuesForYear, resolveDuesForYearOrEstimate, szemelyDijBesorolas, type DuesBand } from "./duesCalc.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
// A Búzásbocsárdi Református Egyházközség éles díjszabása (2026-tól): 0-20 mentes, 21-70 teljes díj, 70-120 kedvezményes.
const B26: DuesBand[] = [
  { korhatarTol: 0, korhatarIg: 20, osszeg: 0 },
  { korhatarTol: 21, korhatarIg: 70, osszeg: 220 },
  { korhatarTol: 70, korhatarIg: 120, osszeg: 110 },
];
const B25: DuesBand[] = [
  { korhatarTol: 0, korhatarIg: 21, osszeg: 0 },
  { korhatarTol: 21, korhatarIg: 70, osszeg: 200 },
  { korhatarTol: 70, korhatarIg: 120, osszeg: 100 },
];
const ossz = (szul: string, ev: number, bands: DuesBand[]) => resolveDuesForYear(d(szul), ev, bands).esedekesOsszeg;

test("aki január 1-jén még nem 70 éves, a teljes díjat fizeti - akkor is, ha az év közben tölti be (2026)", () => {
  assert.equal(ossz("1956-02-05", 2026, B26), 220); // 2026. feb. 5-én lett 70
  assert.equal(ossz("1956-12-31", 2026, B26), 220);
  assert.equal(ossz("1956-01-02", 2026, B26), 220);
});

test("aki január 1-jéig betöltötte a 70-et, kedvezményes díjat fizet (2026)", () => {
  assert.equal(ossz("1956-01-01", 2026, B26), 110); // pont január 1-jén lett 70
  assert.equal(ossz("1955-12-31", 2026, B26), 110);
  assert.equal(ossz("1940-06-08", 2026, B26), 110);
});

test("ugyanez a szabály 2027-re és az utána következő évekre is (a legutóbbi díjszabással)", () => {
  for (const ev of [2027, 2028, 2030, 2040]) {
    const hetven = ev - 70;
    assert.equal(ossz(`${hetven}-01-01`, ev, B26), 110, `${ev}: január 1-jén 70`);
    assert.equal(ossz(`${hetven}-01-02`, ev, B26), 220, `${ev}: január 2-án született, január 1-jén még 69`);
    assert.equal(ossz(`${hetven}-12-31`, ev, B26), 220, `${ev}: év végén lett 70`);
    assert.equal(ossz(`${hetven - 1}-12-31`, ev, B26), 110, `${ev}: tavaly lett 70`);
  }
});

test("ugyanez 2025-re is (2025-ös díjszabás)", () => {
  assert.equal(ossz("1955-08-31", 2025, B25), 200); // 2025-ben lett 70 - még teljes díj
  assert.equal(ossz("1955-01-01", 2025, B25), 100);
  assert.equal(ossz("1954-12-31", 2025, B25), 100);
});

test("mentesség: aki január 1-jén még nem töltötte be a 21-et, nem fizet (0-20 sáv); a 21 évesek már fizetnek", () => {
  assert.equal(ossz("2005-01-02", 2026, B26), 0); // jan. 1-jén 20
  assert.equal(ossz("2005-12-31", 2026, B26), 0);
  assert.equal(ossz("2005-01-01", 2026, B26), 220); // jan. 1-jén 21
  assert.equal(ossz("2004-06-02", 2026, B26), 220);
  assert.equal(ossz("2010-03-03", 2026, B26), 0);
});

test("a besorolás jelzi a mentességet és a kedvezményt", () => {
  const k = resolveDuesForYear(d("1950-01-01"), 2026, B26);
  assert.ok(k.kedvezmenyes && !k.mentes);
  const t = resolveDuesForYear(d("1980-05-05"), 2026, B26);
  assert.ok(!t.kedvezmenyes && !t.mentes);
  const m = resolveDuesForYear(d("2015-05-05"), 2026, B26);
  assert.ok(m.mentes && !m.kedvezmenyes);
});

test("nincs díjszabás: nem ismert; nincs születési dátum: a teljes (legmagasabb) díj becsült összegként", () => {
  assert.equal(resolveDuesForYear(d("1980-01-01"), 2026, []).ismertDijszabas, false);
  const b = resolveDuesForYearOrEstimate(null, 2026, B26);
  assert.equal(b.becsult, true);
  assert.equal(b.dues.esedekesOsszeg, 220);
});

test("a statisztika ugyanabból a besorolásból számol, mint a díj: létszámok és összeg egyeznek", () => {
  const szulok = ["1956-02-05", "1956-01-01", "1955-12-31", "1980-05-05", "2005-01-02", "2005-01-01", "2012-01-01", "1990-03-03"];
  const besorolasok = szulok.map((s) => szemelyDijBesorolas(d(s), 2026, B26));
  const st = dijStatisztika(besorolasok);
  // kézi számolás: 220 (1956-02-05), 110, 110, 220, 0, 220, 0, 220
  assert.deepEqual(st, { mentes: 2, fizetendo: 6, kedvezmenyes: 2, esedekesOsszeg: 220 + 110 + 110 + 220 + 220 + 220 });
  assert.equal(besorolasok[0].kor, 69);
  assert.equal(besorolasok[1].kor, 70);
  // az egyes személyek díjának összege = a statisztika összege
  const egyenkent = szulok.reduce((s, sz) => s + (ossz(sz, 2026, B26) ?? 0), 0);
  assert.equal(egyenkent, st.esedekesOsszeg);
});

test("a névsor (kategória szerinti szűrés) és a statisztika létszáma mindig egyezik", () => {
  const szulok = ["1956-02-05", "1956-01-01", "1955-12-31", "1940-03-03", "1980-05-05", "2005-01-02", "2005-01-01", "2012-01-01", "1990-03-03", "1999-09-09"];
  const bes = szulok.map((s) => szemelyDijBesorolas(d(s), 2026, B26));
  const st = dijStatisztika(bes);
  assert.equal(bes.filter((b) => dijKategoria(b) === "mentes").length, st.mentes);
  assert.equal(bes.filter((b) => dijKategoria(b) === "kedvezmenyes").length, st.kedvezmenyes);
  assert.equal(bes.filter((b) => ["teljes", "kedvezmenyes"].includes(dijKategoria(b) ?? "")).length, st.fizetendo);
  assert.equal(dijKategoria(szemelyDijBesorolas(d("1956-02-05"), 2026, B26)), "teljes"); // még nem 70 január 1-jén
  assert.equal(dijKategoria(szemelyDijBesorolas(d("1956-01-01"), 2026, B26)), "kedvezmenyes");
});
