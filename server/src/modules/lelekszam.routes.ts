import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../auth/plugin.js";
import { canAccessGyulekezet } from "../auth/scope.js";
import { computeEligibleVoters, suggestSigners } from "./valasztok.routes.js";
import { getDuesBandsForYear, resolveDuesForYear } from "./duesCalc.js";
import { ageOn } from "../lib/age.js";

interface NemBontas {
  ferfi: number;
  no: number;
  egyutt: number;
}

function ures(): NemBontas {
  return { ferfi: 0, no: 0, egyutt: 0 };
}

/**
 * "Pontban vett" lélekszám egy adott dátumra (jellemzően egy év dec. 31-e) - mivel a rendszer nem
 * tárol történeti pillanatfelvételeket, ez a JELENLEGI állományból becsül visszamenőleg: mindenki
 * beleszámít, aki ma is a gyülekezet tagja, ÉS akkor még nem hunyt el (vagy elhalálozási dátuma
 * ismeretlen). Aki azóta került a gyülekezetbe vagy időközben véglegesen törölve lett, azt nem
 * tudjuk visszamenőleg figyelembe venni - ezért ez becslés, nem pontos történeti adat.
 */
async function lelekszamPontban(gyulekezetId: string, datum: Date): Promise<NemBontas> {
  const persons = await prisma.person.findMany({
    where: {
      gyulekezetId,
      OR: [{ elhunyt: false }, { elhunytDatuma: null }, { elhunytDatuma: { gt: datum } }],
    },
    select: { nem: true },
  });
  const eredmeny = ures();
  for (const p of persons) {
    eredmeny.egyutt++;
    if (p.nem === "FERFI") eredmeny.ferfi++;
    else eredmeny.no++;
  }
  return eredmeny;
}

/** Az egyházfenntartás "meghatározott" éves összege - a banded díjrendszerünkben nincs egyetlen
 * flat szám, ezért a legmagasabb (jellemzően a sztenderd felnőtt) sávot vesszük irányadónak. */
async function egyhazfenntartoiAlapOsszeg(gyulekezetId: string, ev: number): Promise<number> {
  const bands = await getDuesBandsForYear(gyulekezetId, ev);
  if (bands.length === 0) return 0;
  return bands.reduce((max, b) => Math.max(max, Number(b.osszeg)), 0);
}

/** Azon felnőtt (18 év feletti) egyháztagok száma, akik az elmúlt 5 évben (amelyikre ismert a
 * díjszabás) minden évben tartoztak, és egyik évre sem fizettek eleget - vagyis a teljes vizsgált
 * időszakban folyamatosan hátralékban voltak. Ismeretlen díjszabású vagy mentes évek nem
 * számítanak ellenük, ugyanúgy, ahogy a rendszer más pontjain sem büntetjük a hiányzó adatot. */
async function regotaNemFizetok(gyulekezetId: string, ev: number): Promise<number> {
  const evek = [ev - 4, ev - 3, ev - 2, ev - 1, ev];
  const bandsByYear = new Map<number, Awaited<ReturnType<typeof getDuesBandsForYear>>>();
  for (const y of evek) bandsByYear.set(y, await getDuesBandsForYear(gyulekezetId, y));

  const persons = await prisma.person.findMany({
    where: { gyulekezetId, elhunyt: false },
    select: { szuletesiDatum: true, duesPayments: { select: { ev: true, osszeg: true } } },
  });

  let count = 0;
  for (const p of persons) {
    if (!p.szuletesiDatum || ageOn(p.szuletesiDatum, new Date(ev, 11, 31)) < 18) continue;
    let vanIsmertEv = false;
    let mindigTartozott = true;
    for (const y of evek) {
      const dues = resolveDuesForYear(p.szuletesiDatum, y, bandsByYear.get(y)!);
      if (!dues.ismertDijszabas || !dues.esedekesOsszeg || dues.esedekesOsszeg <= 0) continue;
      vanIsmertEv = true;
      const fizetve = p.duesPayments.filter((d) => d.ev === y).reduce((sum, d) => sum + Number(d.osszeg), 0);
      if (fizetve + 0.01 >= dues.esedekesOsszeg) {
        mindigTartozott = false;
        break;
      }
    }
    if (vanIsmertEv && mindigTartozott) count++;
  }
  return count;
}

/**
 * LÉLEKSZÁM JELENTÉS
 * ===================
 * Az egyházmegyei/kerületi "Adatok a lélekszámról" jelentés azon sorai, amik a rendszerben
 * rögzített adatokból megbízhatóan számíthatók (keresztelés, elhalálozás, lélekszám az adott év
 * végén, választói névjegyzék létszáma, egyházfenntartói alapösszeg, régóta nem fizetők,
 * háztartások száma és vallási/családi összetétele, házasságkötések, más településen élők).
 * A többi sor (felekezetváltás, elköltözés más gyülekezetbe/külföldre, nemzetiség, más
 * gyülekezetben is tagság, korábbi évek családszáma) nincs a rendszerben megbízhatóan nyomon
 * követve, ezeket a felület üresen hagyott, kézzel kitöltendő mezőkként kínálja fel - amit tudunk,
 * azt kiszámoljuk, amit nem, azt nem találjuk ki.
 */
async function computeLelekszamAdatok(gyulekezetId: string, ev: number) {
  const evKezdete = new Date(ev, 0, 1);
  const evVege = new Date(ev, 11, 31, 23, 59, 59);
  const elozoEvVege = new Date(ev - 1, 11, 31, 23, 59, 59);

  const [
    keresztelesek,
    elhunytak,
    elozoEviLelekszam,
    decemberVegiLelekszam,
    hazassagok,
    households,
    { eligible, szekhely },
    bekoltozottek,
    egyhazfenntartoOsszeg,
    otEveNemFizetok,
  ] = await Promise.all([
    prisma.baptism.findMany({
      where: { datuma: { gte: evKezdete, lte: evVege }, person: { gyulekezetId } },
      select: { person: { select: { nem: true } } },
    }),
    prisma.person.findMany({
      where: { gyulekezetId, elhunyt: true, elhunytDatuma: { gte: evKezdete, lte: evVege } },
      select: { nem: true },
    }),
    lelekszamPontban(gyulekezetId, elozoEvVege),
    lelekszamPontban(gyulekezetId, evVege),
    prisma.marriage.findMany({
      where: { datuma: { gte: evKezdete, lte: evVege }, spouseA: { gyulekezetId } },
      select: {
        spouseA: { select: { vallas: true } },
        spouseB: { select: { vallas: true } },
        kulsoHazastarsVallasa: true,
      },
    }),
    prisma.household.findMany({
      where: { gyulekezetId },
      select: {
        vallasTipusManualis: true,
        members: {
          select: {
            person: {
              select: {
                vallas: true,
                elhunyt: true,
                csaladiAllapot: true,
                szuletesiDatum: true,
                marriagesA: { where: { vege: null }, select: { kulsoHazastarsVallasa: true } },
                marriagesB: { where: { vege: null }, select: { kulsoHazastarsVallasa: true } },
              },
            },
          },
        },
      },
    }),
    computeEligibleVoters(gyulekezetId, ev),
    prisma.movingRequest.findMany({
      where: { celGyulekezetId: gyulekezetId, status: "ELFOGADVA", kezdemenyezve: { gte: evKezdete, lte: evVege } },
      select: { person: { select: { nem: true } } },
    }),
    egyhazfenntartoiAlapOsszeg(gyulekezetId, ev),
    regotaNemFizetok(gyulekezetId, ev),
  ]);

  const keresztelt = ures();
  for (const b of keresztelesek) {
    keresztelt.egyutt++;
    if (b.person.nem === "FERFI") keresztelt.ferfi++;
    else keresztelt.no++;
  }

  const eltemetett = ures();
  for (const p of elhunytak) {
    eltemetett.egyutt++;
    if (p.nem === "FERFI") eltemetett.ferfi++;
    else eltemetett.no++;
  }

  const bekoltozott = ures();
  for (const b of bekoltozottek) {
    bekoltozott.egyutt++;
    if (b.person.nem === "FERFI") bekoltozott.ferfi++;
    else bekoltozott.no++;
  }

  // A "más településen élő" számításhoz a gyülekezet lélekszámába jelenleg élő (nem elhunyt)
  // tagokat nézzük - a december végi (pontban vett) lélekszámtól függetlenül, mert a lakcím csak
  // a jelen állapotra ismert.
  const eloTagok = await prisma.person.findMany({
    where: { gyulekezetId, elhunyt: false },
    select: { householdMemberships: { select: { household: { select: { address: { select: { telepules: true } } } } } } },
  });
  let masTelepulesenElo = 0;
  for (const p of eloTagok) {
    const telepules = p.householdMemberships[0]?.household.address.telepules;
    if (telepules && szekhely && telepules !== szekhely) masTelepulesenElo++;
  }

  let csaladokEgyezoVallasu = 0;
  let csaladokVegyesVallasu = 0;
  let csaladokOzvegy = 0;
  let csaladokEgyedulallo = 0;
  for (const h of households) {
    const vallasok = new Set<string>();
    for (const m of h.members) {
      if (m.person.vallas) vallasok.add(m.person.vallas);
      for (const marr of m.person.marriagesA) if (marr.kulsoHazastarsVallasa) vallasok.add(marr.kulsoHazastarsVallasa);
      for (const marr of m.person.marriagesB) if (marr.kulsoHazastarsVallasa) vallasok.add(marr.kulsoHazastarsVallasa);
    }
    const tipus = h.vallasTipusManualis ?? (vallasok.size <= 1 ? "EGYEZO" : "VEGYES");
    if (tipus === "EGYEZO") csaladokEgyezoVallasu++;
    else csaladokVegyesVallasu++;

    const eloHaztartasTagok = h.members.filter((m) => !m.person.elhunyt);
    if (eloHaztartasTagok.length === 1) {
      const p = eloHaztartasTagok[0].person;
      if (p.csaladiAllapot === "OZVEGY") csaladokOzvegy++;
      if (p.csaladiAllapot === "NOTLEN_HAJADON" && p.szuletesiDatum && ageOn(p.szuletesiDatum, evVege) >= 30) csaladokEgyedulallo++;
    }
  }

  let hazassagEgyezoVallasu = 0;
  let hazassagNemEgyezoVallasu = 0;
  for (const m of hazassagok) {
    const bVallas = m.spouseB?.vallas ?? m.kulsoHazastarsVallasa ?? null;
    if (m.spouseA.vallas && bVallas && m.spouseA.vallas === bVallas) hazassagEgyezoVallasu++;
    else hazassagNemEgyezoVallasu++;
  }

  return {
    elozoEviLelekszam,
    keresztelt,
    eltemetett,
    bekoltozott,
    decemberVegiLelekszam,
    valasztoiNevjegyzekLetszam: eligible.length,
    egyhazfenntartoOsszeg,
    otEveNemFizetok,
    masTelepulesenElo,
    csaladokSzama: households.length,
    csaladokEgyezoVallasu,
    csaladokVegyesVallasu,
    csaladokOzvegy,
    csaladokEgyedulallo,
    hazassagokSzama: hazassagok.length,
    hazassagEgyezoVallasu,
    hazassagNemEgyezoVallasu,
  };
}

export async function lelekszamRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/lelekszam-jelentes", async (req, reply) => {
    const schema = z.object({ gyulekezetId: z.string(), ev: z.coerce.number().int().min(1900).max(3000).optional() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    if (!(await canAccessGyulekezet(req.currentUser!, parsed.data.gyulekezetId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const gyulekezet = await prisma.gyulekezet.findUnique({ where: { id: parsed.data.gyulekezetId } });
    if (!gyulekezet) return reply.code(404).send({ error: "Nem található" });

    const ev = parsed.data.ev ?? new Date().getFullYear();
    const [adatok, signers] = await Promise.all([
      computeLelekszamAdatok(parsed.data.gyulekezetId, ev),
      suggestSigners(parsed.data.gyulekezetId),
    ]);

    return {
      gyulekezetId: gyulekezet.id,
      gyulekezetNev: gyulekezet.nev,
      ev,
      ...adatok,
      ...signers,
    };
  });
}
