import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertCanEditPerson, getAccessibleGyulekezetIds, isAdmin, type AuthUser } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { getDuesBandsForYear, resolveDuesForYear, resolveDuesForYearOrEstimate } from "./duesCalc.js";

/**
 * Egységesen eldönti, hogy a felhasználó lekérdezheti-e a kért gyülekezet (vagy az összes
 * elérhető gyülekezet) pénzügyi adatait, és előállítja a Prisma where-feltételeket mindkét
 * alakban, amire a lekérdezéseknek szükségük van:
 *   - `gyulekezetWhere`: a Gyulekezet reláción keresztüli szűréshez (pl. `person.gyulekezet`)
 *   - `gyulekezetIdFilter`: a gyulekezetIdEkkor mezőn keresztüli közvetlen szűréshez
 */
async function resolveGyulekezetScope(
  user: AuthUser,
  requestedGyulekezetId: string | undefined
): Promise<
  | { ok: true; gyulekezetWhere: Record<string, unknown>; gyulekezetIdFilter: string | { in: string[] } | undefined }
  | { ok: false }
> {
  const accessible = await getAccessibleGyulekezetIds(user);

  if (requestedGyulekezetId) {
    if (accessible !== "ALL" && !accessible.includes(requestedGyulekezetId)) return { ok: false };
    return { ok: true, gyulekezetWhere: { id: requestedGyulekezetId }, gyulekezetIdFilter: requestedGyulekezetId };
  }

  if (accessible !== "ALL" && accessible.length === 0) return { ok: false };
  return {
    ok: true,
    gyulekezetWhere: accessible === "ALL" ? {} : { id: { in: accessible } },
    gyulekezetIdFilter: accessible === "ALL" ? undefined : { in: accessible },
  };
}

interface YearlyDebt {
  ev: number;
  esedekesOsszeg: number;
  fizetve: number;
  hianyzo: number;
  /** Ha a személynek nincs rögzített születési dátuma, a pontos korsáv helyett a gyülekezet
   * sztenderd (legmagasabb) díját vettük irányadónak - ezt jelzi ez a mező, hogy a felület
   * megkülönböztethesse a pontos és a becsült tartozásokat. */
  becsult: boolean;
}

interface Debtor {
  personId: string;
  nev: string;
  gyulekezetId: string;
  gyulekezetNev: string;
  osszesTartozas: number;
  korabbiTartozas: number;
  evek: YearlyDebt[];
}

/**
 * Azok a személyek és éveik, akikre a megadott évtartományban nem lett (teljesen) befizetve
 * az esedékes egyházfenntartó - kiegészítve azokkal, akiknél a rendszer bevezetése előttről
 * egy korábbi (nyitó) tartozás van rögzítve.
 *
 * Egy évet csak akkor veszünk figyelembe egy személynél, ha arra az évre ISMERT (vagy - ha
 * nincs rögzített születési dátuma - a gyülekezet sztenderd díja alapján BECSÜLT) a díjszabás -
 * ellenkező esetben az adott év egyszerűen kimarad a számításból. A hiányzó születési dátum
 * SOHA nem jelenti azt, hogy valaki ne szerepelhessen a tartozók között - ha egy évre nincs
 * hozzá rögzített befizetés, a sztenderd díj alapján akkor is bekerül, csak "becsült" jelzéssel
 * (ld. `resolveDuesForYearOrEstimate` a duesCalc.ts-ben).
 */
async function computeDebtors(gyulekezetWhere: Record<string, unknown>, evTol: number, evIg: number, personId?: string): Promise<Debtor[]> {
  const persons = await prisma.person.findMany({
    where: { gyulekezet: gyulekezetWhere, elhunyt: false, ...(personId ? { id: personId } : {}) },
    select: {
      id: true,
      vezeteknev: true,
      keresztnev: true,
      szuletesiDatum: true,
      gyulekezetId: true,
      nyitoTartozas: true,
      gyulekezet: { select: { nev: true } },
      duesPayments: {
        where: { ev: { gte: evTol, lte: evIg } },
        select: { ev: true, osszeg: true },
      },
    },
  });

  // Évenkénti gyorsítótár: melyik korsáv-készlet volt ténylegesen érvényben egy adott évben.
  const bandCache = new Map<string, Awaited<ReturnType<typeof getDuesBandsForYear>>>();
  async function bandsForYear(gyulekezetId: string, year: number) {
    const key = `${gyulekezetId}:${year}`;
    let cached = bandCache.get(key);
    if (!cached) {
      cached = await getDuesBandsForYear(gyulekezetId, year);
      bandCache.set(key, cached);
    }
    return cached;
  }

  const debtors: Debtor[] = [];

  for (const person of persons) {
    const paidByYear = new Map<number, number>();
    for (const p of person.duesPayments) {
      paidByYear.set(p.ev, (paidByYear.get(p.ev) ?? 0) + Number(p.osszeg));
    }

    const evek: YearlyDebt[] = [];
    for (let ev = evTol; ev <= evIg; ev++) {
      const bands = await bandsForYear(person.gyulekezetId, ev);
      const { dues, becsult } = resolveDuesForYearOrEstimate(person.szuletesiDatum, ev, bands);
      if (!dues.ismertDijszabas || !dues.esedekesOsszeg || dues.esedekesOsszeg <= 0) continue;
      const fizetve = paidByYear.get(ev) ?? 0;
      const hianyzo = dues.esedekesOsszeg - fizetve;
      if (hianyzo > 0.01) {
        evek.push({ ev, esedekesOsszeg: dues.esedekesOsszeg, fizetve, hianyzo, becsult });
      }
    }

    const korabbiTartozas = Number(person.nyitoTartozas);
    if (evek.length === 0 && korabbiTartozas <= 0.01) continue;

    debtors.push({
      personId: person.id,
      nev: `${person.vezeteknev} ${person.keresztnev}`,
      gyulekezetId: person.gyulekezetId,
      gyulekezetNev: person.gyulekezet.nev,
      osszesTartozas: evek.reduce((sum, e) => sum + e.hianyzo, 0) + korabbiTartozas,
      korabbiTartozas,
      evek,
    });
  }

  debtors.sort((a, b) => b.osszesTartozas - a.osszesTartozas);
  return debtors;
}

const yearQuerySchema = z.object({
  gyulekezetId: z.string().optional(),
  ev: z.coerce.number().int().min(1900).max(3000).optional(),
});

export async function duesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Azok listázása, akik nem fizették be (teljesen) az egyházfenntartói járulékot
  // a megadott évtől a megadott évig terjedő időszak valamelyik évére.
  app.get("/api/dues-debtors", async (req, reply) => {
    const currentYear = new Date().getFullYear();
    const schema = z.object({
      gyulekezetId: z.string().optional(),
      evTol: z.coerce.number().int().min(1900).max(3000).optional(),
      evIg: z.coerce.number().int().min(1900).max(3000).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const evIg = parsed.data.evIg ?? currentYear;
    const evTol = parsed.data.evTol ?? evIg;
    if (evTol > evIg) return reply.code(400).send({ error: "Az 'évtől' nem lehet nagyobb, mint az 'évig'" });

    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    const debtors = await computeDebtors(scope.gyulekezetWhere, evTol, evIg);
    return { evTol, evIg, debtors };
  });

  // Egy személy hiányzó (nem, vagy nem teljesen befizetett) egyházfenntartói évei az utolsó
  // néhány évre visszamenőleg - a befizetés-rögzítő űrlap ezzel ajánlja fel a konkrét éveket
  // és a hozzájuk tartozó (helyes, akkor érvényes) összeget, ahelyett hogy a felhasználónak
  // találgatnia kéne, melyik évre és mennyivel tartozik még valaki.
  app.get("/api/persons/:id/hianyzo-evek", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, id))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const person = await prisma.person.findUnique({
      where: { id },
      select: { szuletesiDatum: true, gyulekezetId: true, duesPayments: { select: { ev: true, osszeg: true } } },
    });
    if (!person) return reply.code(404).send({ error: "Nem található" });
    if (!person.szuletesiDatum) return { evek: [] };

    const paidByYear = new Map<number, number>();
    for (const p of person.duesPayments) {
      paidByYear.set(p.ev, (paidByYear.get(p.ev) ?? 0) + Number(p.osszeg));
    }

    const currentYear = new Date().getFullYear();
    const evek: { ev: number; esedekesOsszeg: number; fizetve: number; hianyzo: number }[] = [];
    for (let ev = currentYear - 5; ev <= currentYear; ev++) {
      const bands = await getDuesBandsForYear(person.gyulekezetId, ev);
      const dues = resolveDuesForYear(person.szuletesiDatum, ev, bands);
      if (!dues.ismertDijszabas || !dues.esedekesOsszeg || dues.esedekesOsszeg <= 0) continue;
      const fizetve = paidByYear.get(ev) ?? 0;
      const hianyzo = dues.esedekesOsszeg - fizetve;
      if (hianyzo > 0.01) {
        evek.push({ ev, esedekesOsszeg: dues.esedekesOsszeg, fizetve, hianyzo });
      }
    }
    return { evek };
  });

  // Egy adott év befizetéseinek/adományainak és a hátralékok összesítése - a pénzügyek áttekintéséhez.
  app.get("/api/penzugyi-osszesito", async (req, reply) => {
    const currentYear = new Date().getFullYear();
    const parsed = yearQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    const ev = parsed.data.ev ?? currentYear;

    const [duesSum, donationSum, persons, debtors, payers] = await Promise.all([
      prisma.duesPayment.aggregate({ _sum: { osszeg: true }, where: { ev, gyulekezetIdEkkor: scope.gyulekezetIdFilter } }),
      prisma.donation.aggregate({ _sum: { osszeg: true }, where: { ev, gyulekezetIdEkkor: scope.gyulekezetIdFilter } }),
      prisma.person.findMany({
        where: { gyulekezet: scope.gyulekezetWhere, elhunyt: false },
        select: { szuletesiDatum: true, gyulekezetId: true },
      }),
      computeDebtors(scope.gyulekezetWhere, ev, ev),
      // Ki fizetett ténylegesen erre az évre - ez pusztán tényadat, nem függ attól, hogy ismerjük-e
      // az akkori díjszabást (ellentétben a "fizetendő"/"mentes"/"kedvezményes" besorolással).
      prisma.duesPayment.findMany({
        where: { ev, gyulekezetIdEkkor: scope.gyulekezetIdFilter },
        distinct: ["personId"],
        select: { personId: true },
      }),
    ]);

    const bandCache = new Map<string, Awaited<ReturnType<typeof getDuesBandsForYear>>>();
    async function bandsFor(gyulekezetId: string) {
      let cached = bandCache.get(gyulekezetId);
      if (!cached) {
        cached = await getDuesBandsForYear(gyulekezetId, ev);
        bandCache.set(gyulekezetId, cached);
      }
      return cached;
    }

    let mentesSzemelyek = 0;
    let kedvezmenyesSzemelyek = 0;
    let fizetendoSzemelyek = 0;
    for (const person of persons) {
      const bands = await bandsFor(person.gyulekezetId);
      const { dues } = resolveDuesForYearOrEstimate(person.szuletesiDatum, ev, bands);
      if (!dues.ismertDijszabas) continue; // erre az évre nincs (visszamenőleg) ismert vagy becsülhető díjszabás
      if (dues.mentes) mentesSzemelyek++;
      else if (dues.esedekesOsszeg && dues.esedekesOsszeg > 0) {
        fizetendoSzemelyek++;
        if (dues.kedvezmenyes) kedvezmenyesSzemelyek++;
      }
    }

    // A "korábbi (nyitó) tartozás" nem az adott évhez kötött összeg, hanem egy állandó, a rendszer
    // bevezetése előttről áthozott hátralék - ezért külön kell kezelni, nem szabad belekeverni az
    // adott évi fizetendő/fizetők arányába (különben a "fizetők száma" negatívba fordulhatna olyan
    // évekre, amikre nincs ismert díjszabás, de van nyitótartozással rendelkező személy).
    const tartozokSzama = debtors.filter((d) => d.evek.length > 0).length;
    const osszesTartozas = debtors.reduce((sum, d) => sum + d.evek.reduce((s, e) => s + e.hianyzo, 0), 0);
    const nyitoTartozasSzemelyek = debtors.filter((d) => d.korabbiTartozas > 0).length;
    const nyitoTartozasOsszeg = debtors.reduce((sum, d) => sum + d.korabbiTartozas, 0);

    return {
      ev,
      egyhazfenntartoBefolyt: Number(duesSum._sum.osszeg ?? 0),
      adomanyBefolyt: Number(donationSum._sum.osszeg ?? 0),
      fizetendoSzemelyek,
      // "Már fizettek" a ténylegesen befizetett tranzakciókból számít, NEM a fizetendő/tartozik
      // különbségéből - így olyan évekre is helyes marad, amikre nem ismert a díjszabás (pl. a
      // rendszer bevezetése előtti évek), ahol a fizetendő/tartozik számítás nem is végezhető el.
      fizetokSzama: payers.length,
      tartozokSzama,
      osszesTartozas,
      nyitoTartozasSzemelyek,
      nyitoTartozasOsszeg,
      mentesSzemelyek,
      kedvezmenyesSzemelyek,
    };
  });

  // Egy adott év egyházfenntartói befizetéseinek listája - a könyveléssel való összevetéshez.
  app.get("/api/dues-payments", async (req, reply) => {
    const currentYear = new Date().getFullYear();
    const parsed = yearQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    const ev = parsed.data.ev ?? currentYear;
    const payments = await prisma.duesPayment.findMany({
      where: { ev, gyulekezetIdEkkor: scope.gyulekezetIdFilter },
      include: { person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
      orderBy: { fizetesDatuma: "desc" },
    });

    return payments.map((p) => ({
      id: p.id,
      personId: p.person.id,
      nev: `${p.person.vezeteknev} ${p.person.keresztnev}`,
      ev: p.ev,
      osszeg: Number(p.osszeg),
      fizetesDatuma: p.fizetesDatuma,
    }));
  });

  // Egy adott év adományainak listája - a könyveléssel való összevetéshez.
  app.get("/api/donations", async (req, reply) => {
    const currentYear = new Date().getFullYear();
    const parsed = yearQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const scope = await resolveGyulekezetScope(req.currentUser!, parsed.data.gyulekezetId);
    if (!scope.ok) return reply.code(403).send({ error: "Nincs jogosultság" });

    const ev = parsed.data.ev ?? currentYear;
    const donations = await prisma.donation.findMany({
      where: { ev, gyulekezetIdEkkor: scope.gyulekezetIdFilter },
      include: { person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
      orderBy: { fizetesDatuma: "desc" },
    });

    return donations.map((d) => ({
      id: d.id,
      personId: d.person.id,
      nev: `${d.person.vezeteknev} ${d.person.keresztnev}`,
      ev: d.ev,
      osszeg: Number(d.osszeg),
      celja: d.celja,
      fizetesDatuma: d.fizetesDatuma,
    }));
  });

  // Egyházfenntartói járulék - szándékosan külön végpont, nem keverhető az adománnyal.
  // Tartozás kifizetése: a befizetett összeget a legrégebbi hátralékra számolja el - előbb a
  // nyitó (rendszer előtti) tartozásra, majd évenként növekvő sorrendben az egyes évek hiányzó
  // összegére (évenkénti DuesPayment rekordként) -, így a tartozók listája mindig pontosan a
  // maradék tartozást mutatja.
  app.post("/api/dues-debtors/pay", async (req, reply) => {
    const schema = z.object({
      personId: z.string(),
      osszeg: z.number().positive(),
      evTol: z.number().int().min(1900).max(3000),
      evIg: z.number().int().min(1900).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, parsed.data.personId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId }, select: { gyulekezetId: true, nyitoTartozas: true, elhunyt: true } });
    if (!person) return reply.code(404).send({ error: "Nem található" });
    if (person.elhunyt) return reply.code(400).send({ error: "Elhunyt személyhez nem rögzíthető egyházfenntartói befizetés" });

    const [debtor] = await computeDebtors({ id: person.gyulekezetId }, parsed.data.evTol, parsed.data.evIg, parsed.data.personId);
    if (!debtor) return reply.code(400).send({ error: "Ennek a személynek nincs tartozása a megadott időszakra" });
    if (parsed.data.osszeg - debtor.osszesTartozas > 0.01) {
      return reply.code(400).send({ error: `A befizetés (${parsed.data.osszeg} lej) nagyobb a tartozásnál (${debtor.osszesTartozas} lej)` });
    }

    let remaining = parsed.data.osszeg;
    if (debtor.korabbiTartozas > 0.01 && remaining > 0.001) {
      const pay = Math.min(remaining, debtor.korabbiTartozas);
      await prisma.person.update({ where: { id: parsed.data.personId }, data: { nyitoTartozas: Math.max(0, debtor.korabbiTartozas - pay) } });
      remaining -= pay;
    }
    for (const e of [...debtor.evek].sort((a, b) => a.ev - b.ev)) {
      if (remaining <= 0.001) break;
      const pay = Math.min(remaining, e.hianyzo);
      await prisma.duesPayment.create({
        data: { personId: parsed.data.personId, ev: e.ev, osszeg: pay, fizetesDatuma: new Date(), gyulekezetIdEkkor: person.gyulekezetId },
      });
      remaining -= pay;
    }
    return { ok: true, kifizetve: parsed.data.osszeg, maradek: Math.max(0, Math.round((debtor.osszesTartozas - parsed.data.osszeg) * 100) / 100) };
  });

  app.post("/api/dues-payments", async (req, reply) => {
    const schema = z.object({
      personId: z.string(),
      ev: z.number().int().min(1900).max(3000),
      osszeg: z.number().positive(),
      fizetesDatuma: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, parsed.data.personId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person) return reply.code(404).send({ error: "Nem található" });
    if (person.elhunyt) return reply.code(400).send({ error: "Elhunyt személyhez nem rögzíthető egyházfenntartói befizetés" });

    const payment = await prisma.duesPayment.create({
      data: {
        personId: parsed.data.personId,
        ev: parsed.data.ev,
        osszeg: parsed.data.osszeg,
        fizetesDatuma: parsed.data.fizetesDatuma ? new Date(parsed.data.fizetesDatuma) : new Date(),
        gyulekezetIdEkkor: person.gyulekezetId,
      },
    });
    return payment;
  });

  // Adomány - szándékosan külön végpont, nem keverhető az egyházfenntartói járulékkal.
  app.post("/api/donations", async (req, reply) => {
    const schema = z.object({
      personId: z.string(),
      ev: z.number().int().min(1900).max(3000),
      osszeg: z.number().positive(),
      celja: z.string().optional().nullable(),
      fizetesDatuma: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, parsed.data.personId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person) return reply.code(404).send({ error: "Nem található" });
    if (person.elhunyt) return reply.code(400).send({ error: "Elhunyt személyhez nem rögzíthető adomány" });

    const donation = await prisma.donation.create({
      data: {
        personId: parsed.data.personId,
        ev: parsed.data.ev,
        osszeg: parsed.data.osszeg,
        celja: parsed.data.celja ?? null,
        fizetesDatuma: parsed.data.fizetesDatuma ? new Date(parsed.data.fizetesDatuma) : new Date(),
        gyulekezetIdEkkor: person.gyulekezetId,
      },
    });
    return donation;
  });

  async function assertPaymentEditable(userIsAdmin: boolean, canEdit: boolean, reply: any): Promise<boolean> {
    if (!userIsAdmin && !canEdit) {
      reply.code(403).send({ error: "Nincs jogosultság" });
      return false;
    }
    return true;
  }

  const editSchema = z.object({
    ev: z.number().int().min(1900).max(3000).optional(),
    osszeg: z.number().positive().optional(),
    fizetesDatuma: z.string().optional().nullable(),
  });

  app.put("/api/dues-payments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const existing = await prisma.duesPayment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!(await assertPaymentEditable(isAdmin(user), await assertCanEditPerson(user, existing.personId), reply))) return;
    const updated = await prisma.duesPayment.update({
      where: { id },
      data: {
        ...(parsed.data.ev !== undefined ? { ev: parsed.data.ev } : {}),
        ...(parsed.data.osszeg !== undefined ? { osszeg: parsed.data.osszeg } : {}),
        ...(parsed.data.fizetesDatuma !== undefined
          ? { fizetesDatuma: parsed.data.fizetesDatuma ? new Date(parsed.data.fizetesDatuma) : new Date() }
          : {}),
      },
    });
    return updated;
  });

  app.delete("/api/dues-payments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.duesPayment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!(await assertPaymentEditable(isAdmin(user), await assertCanEditPerson(user, existing.personId), reply))) return;
    await prisma.duesPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  app.put("/api/donations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = editSchema.extend({ celja: z.string().optional().nullable() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const existing = await prisma.donation.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!(await assertPaymentEditable(isAdmin(user), await assertCanEditPerson(user, existing.personId), reply))) return;
    const updated = await prisma.donation.update({
      where: { id },
      data: {
        ...(parsed.data.ev !== undefined ? { ev: parsed.data.ev } : {}),
        ...(parsed.data.osszeg !== undefined ? { osszeg: parsed.data.osszeg } : {}),
        ...(parsed.data.celja !== undefined ? { celja: parsed.data.celja } : {}),
        ...(parsed.data.fizetesDatuma !== undefined
          ? { fizetesDatuma: parsed.data.fizetesDatuma ? new Date(parsed.data.fizetesDatuma) : new Date() }
          : {}),
      },
    });
    return updated;
  });

  app.delete("/api/donations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.donation.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!(await assertPaymentEditable(isAdmin(user), await assertCanEditPerson(user, existing.personId), reply))) return;
    await prisma.donation.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
