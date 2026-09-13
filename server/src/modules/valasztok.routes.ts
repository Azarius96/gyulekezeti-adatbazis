import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { canAccessGyulekezet } from "../auth/scope.js";
import { getDuesBandsForYear, resolveDuesForYear } from "./duesCalc.js";
import { ageOn } from "../lib/age.js";

/**
 * VÁLASZTÓI NÉVJEGYZÉK
 * =====================
 * Jogosultsági feltételek a Kánon 12. §. a) és 37. §. alapján: konfirmált, a névjegyzék évének
 * végén (dec. 31.) betöltötte a 18. életévét, és az előző évi (dec. 31-ig esedékes) egyházfenn-
 * tartói járulékát a névjegyzék összeállításáig befizette (vagy arra az évre mentes volt).
 * Ha egy évre nincs ismert díjszabás rögzítve, a hiányzó adat miatt nem zárjuk ki a személyt.
 */
export async function computeEligibleVoters(gyulekezetId: string, ev: number) {
  const persons = await prisma.person.findMany({
    where: { gyulekezetId, elhunyt: false },
    include: {
      confirmation: true,
      duesPayments: { where: { ev: ev - 1 } },
      householdMemberships: { include: { household: { include: { address: true } } } },
    },
    orderBy: [{ vezeteknev: "asc" }, { keresztnev: "asc" }],
  });

  // Ha ebben a gyülekezetben senkinek sincs rögzítve konfirmáció, az adat egyszerűen nincs
  // vezetve a rendszerben - ilyenkor a konfirmáltság tényét nem kérjük számon (nem büntetjük a
  // hiányzó adatot), csak a kort és a járulékfizetést nézzük. Ha viszont van legalább egy
  // rögzített konfirmáció, az adat követett, és a törvény szerint szigorúan érvényesítjük.
  const konfirmaciotKovetik = persons.some((p) => p.confirmation !== null);

  const prevYearBands = await getDuesBandsForYear(gyulekezetId, ev - 1);

  const eligible: {
    id: string;
    vezeteknev: string;
    keresztnev: string;
    szuletesiDatum: string | null;
    eletkor: number;
    cim: string;
    utca: string;
    hazszam: string;
  }[] = [];

  // A gyülekezet székhelyét a háztartások címeiből következtetjük ki (a leggyakoribb település),
  // hogy a "Kelt hely" mezőt ne kelljen minden alkalommal kézzel megadni.
  const telepulesGyakorisag: Record<string, number> = {};

  for (const p of persons) {
    const hh = p.householdMemberships[0]?.household;
    if (hh) {
      telepulesGyakorisag[hh.address.telepules] = (telepulesGyakorisag[hh.address.telepules] ?? 0) + 1;
    }

    if (konfirmaciotKovetik && !p.confirmation) continue;
    if (!p.szuletesiDatum) continue;
    const age = ageOn(p.szuletesiDatum, new Date(ev, 11, 31));
    if (age < 18) continue;

    const dues = resolveDuesForYear(p.szuletesiDatum, ev - 1, prevYearBands);
    if (dues.ismertDijszabas && dues.esedekesOsszeg && dues.esedekesOsszeg > 0) {
      const paid = p.duesPayments.reduce((sum, d) => sum + Number(d.osszeg), 0);
      if (paid + 0.01 < dues.esedekesOsszeg) continue;
    }

    const utca = hh?.address.utca ?? "";
    const hazszam = hh?.address.hazszam ?? "";
    eligible.push({
      id: p.id,
      vezeteknev: p.vezeteknev,
      keresztnev: p.keresztnev,
      szuletesiDatum: p.szuletesiDatum.toISOString().slice(0, 10),
      eletkor: age,
      cim: hh ? `${utca} ${hazszam}` : "",
      utca,
      hazszam,
    });
  }

  // Kérésre: a névjegyzék utcanév szerint ábécérendben, azon belül házszám szerint (numerikusan,
  // ahol lehet) rendezve jelenjen meg - nem vezeték-/keresztnév szerint.
  eligible.sort((a, b) => {
    const utcaCompare = a.utca.localeCompare(b.utca, "hu");
    if (utcaCompare !== 0) return utcaCompare;
    const aNum = parseInt(a.hazszam, 10);
    const bNum = parseInt(b.hazszam, 10);
    if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    return a.hazszam.localeCompare(b.hazszam, "hu");
  });

  let szekhely = "";
  let maxCount = 0;
  for (const [telepules, count] of Object.entries(telepulesGyakorisag)) {
    if (count > maxCount) {
      maxCount = count;
      szekhely = telepules;
    }
  }

  return { eligible, konfirmaciotKovetik, szekhely };
}

export async function suggestSigners(gyulekezetId: string) {
  const lelkeszRole = await prisma.userRole.findFirst({
    where: { gyulekezetId, szerepKor: "LELKESZ" },
    include: { user: true },
  });
  const gondnok = await prisma.position.findFirst({
    where: { gyulekezetId, tisztseg: { in: ["GONDNOK", "FOGONDNOK"] }, vege: null },
    include: { person: true },
    orderBy: { kezdete: "desc" },
  });
  return {
    lelkeszNev: lelkeszRole?.user.nev ?? "",
    gondnokNev: gondnok ? `${gondnok.person.vezeteknev} ${gondnok.person.keresztnev}` : "",
  };
}

export async function valasztokRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/valasztoi-nevjegyzek", async (req, reply) => {
    const schema = z.object({ gyulekezetId: z.string(), ev: z.coerce.number().int().min(1900).max(3000).optional() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    if (!(await canAccessGyulekezet(req.currentUser!, parsed.data.gyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const gyulekezet = await prisma.gyulekezet.findUnique({ where: { id: parsed.data.gyulekezetId } });
    if (!gyulekezet) return reply.code(404).send({ error: "Nem található" });

    const ev = parsed.data.ev ?? new Date().getFullYear();
    const [{ eligible, konfirmaciotKovetik, szekhely }, signers] = await Promise.all([
      computeEligibleVoters(parsed.data.gyulekezetId, ev),
      suggestSigners(parsed.data.gyulekezetId),
    ]);

    return {
      gyulekezetId: gyulekezet.id,
      gyulekezetNev: gyulekezet.nev,
      ev,
      jogosultak: eligible,
      konfirmaciotKovetik,
      szekhely,
      ...signers,
    };
  });
}
