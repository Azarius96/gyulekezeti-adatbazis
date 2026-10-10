import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, assertCanEditPerson, isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { getFamilyOverview, applyWidowhoodCascade } from "./family.js";
import { ageOn } from "../lib/age.js";
import { loadDuesBandsByYear, computeMemberDuesInfo } from "./duesCalc.js";
import { matchesAllWords } from "../lib/search.js";

const sacramentSchema = z.object({
  datuma: z.string(),
  helye: z.string().optional().nullable(),
  lelkeszNeve: z.string().optional().nullable(),
});

const personCreateSchema = z.object({
  vezeteknev: z.string().min(1),
  keresztnev: z.string().min(1),
  nem: z.enum(["FERFI", "NO"]),
  szuletesiDatum: z.string().optional().nullable(),
  szuletesiHely: z.string().optional().nullable(),
  vallas: z.string().optional().nullable(),
  csaladiAllapot: z.enum(["NOTLEN_HAJADON", "HAZAS", "OZVEGY", "ELVALT"]).optional().nullable(),
  elhunyt: z.boolean().optional(),
  elhunytDatuma: z.string().optional().nullable(),
  megjegyzes: z.string().optional().nullable(),
  nyitoTartozas: z.number().min(0).optional(),
  gyulekezetId: z.string().min(1),
  kereszteles: sacramentSchema.optional().nullable(),
  konfirmacio: sacramentSchema.optional().nullable(),
  koltozottHonnan: z.string().optional().nullable(),
  tisztseg: z.enum(["PRESBITER", "POTPRESBITER", "GONDNOK", "FOGONDNOK", "NOSZOVETSEGI_TAG"]).optional().nullable(),
});

export async function personRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Lista + keresés
  app.get("/api/persons", async (req, reply) => {
    const user = req.currentUser!;
    const query = (req.query as {
      q?: string;
      gyulekezetId?: string;
      elhunyt?: string;
      nem?: string;
      korTol?: string;
      korIg?: string;
      tisztseg?: string;
      konfirmalt?: string;
    }) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);

    if (query.gyulekezetId && accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const where: Record<string, unknown> = {};
    if (accessible !== "ALL") {
      where.gyulekezetId = { in: accessible };
    }
    if (query.gyulekezetId) {
      where.gyulekezetId = query.gyulekezetId;
    }
    // A "q" (név/cím) szűrés szándékosan NEM itt, az adatbázis-szintű where-ben történik - a
    // Postgres `contains` ékezet-érzékeny lenne (pl. "szabo" nem találná meg "Szabó"-t), ezért
    // lejjebb, a lekérdezett listán, memóriában szűrünk (ld. matchesAllWords).
    if (query.elhunyt !== undefined) {
      where.elhunyt = query.elhunyt === "true";
    }
    if (query.nem === "FERFI" || query.nem === "NO") {
      where.nem = query.nem;
    }
    if (query.tisztseg) {
      where.positions = {
        some: { tisztseg: { in: query.tisztseg.split(",") }, vege: null },
      };
    }
    if (query.konfirmalt === "true") {
      where.confirmation = { isNot: null };
    }

    const personsRaw = await prisma.person.findMany({
      where,
      orderBy: [{ vezeteknev: "asc" }, { keresztnev: "asc" }],
      select: {
        id: true,
        vezeteknev: true,
        keresztnev: true,
        nem: true,
        szuletesiDatum: true,
        elhunyt: true,
        gyulekezetId: true,
        householdMemberships: {
          select: { household: { select: { address: { select: { utca: true, telepules: true, hazszam: true } } } } },
        },
      },
      take: 1000,
    });

    let persons = query.q
      ? personsRaw.filter((p) => {
          if (matchesAllWords([p.vezeteknev, p.keresztnev], query.q!)) return true;
          return p.householdMemberships.some((hm) =>
            matchesAllWords([hm.household.address.utca, hm.household.address.telepules, hm.household.address.hazszam], query.q!)
          );
        })
      : personsRaw;

    if (query.korTol !== undefined || query.korIg !== undefined) {
      const now = new Date();
      const korTol = query.korTol !== undefined ? Number(query.korTol) : 0;
      const korIg = query.korIg !== undefined ? Number(query.korIg) : 999;
      persons = persons.filter((p) => {
        if (!p.szuletesiDatum) return false;
        const age = ageOn(p.szuletesiDatum, now);
        return age >= korTol && age <= korIg;
      });
    }

    return persons.slice(0, 500).map(({ householdMemberships, ...p }) => p);
  });

  app.get("/api/persons/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        baptism: true,
        confirmation: true,
        householdMemberships: { include: { household: { include: { address: true } } } },
        positions: true,
        duesPayments: { orderBy: { ev: "desc" } },
        donations: { orderBy: { ev: "desc" } },
        burial: { include: { sirhely: { include: { parcella: { include: { cemetery: true } } } }, cemetery: true } },
        movingHistory: {
          orderBy: { kezdemenyezve: "desc" },
          include: { forrasGyulekezet: { select: { nev: true } }, celGyulekezet: { select: { nev: true } } },
        },
      },
    });
    if (!person) return reply.code(404).send({ error: "Nem található" });

    const accessible = await getAccessibleGyulekezetIds(user);
    if (accessible !== "ALL" && !accessible.includes(person.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const csalad = await getFamilyOverview(id);
    const duesInfo = computeMemberDuesInfo(person, await loadDuesBandsByYear(person.gyulekezetId));
    return { ...person, csalad, ...duesInfo };
  });

  app.post("/api/persons", async (req, reply) => {
    const parsed = personCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const user = req.currentUser!;
    if (!canEditGyulekezet(user, parsed.data.gyulekezetId) && !isAdmin(user)) {
      return reply.code(403).send({ error: "Nincs jogosultság ehhez a gyülekezethez" });
    }
    const data = parsed.data;
    const person = await prisma.person.create({
      data: {
        vezeteknev: data.vezeteknev,
        keresztnev: data.keresztnev,
        nem: data.nem,
        szuletesiDatum: data.szuletesiDatum ? new Date(data.szuletesiDatum) : null,
        szuletesiHely: data.szuletesiHely ?? null,
        vallas: data.vallas ?? null,
        csaladiAllapot: data.csaladiAllapot ?? null,
        megjegyzes: data.megjegyzes ?? null,
        gyulekezetId: data.gyulekezetId,
      },
    });

    if (data.kereszteles) {
      await prisma.baptism.create({
        data: {
          personId: person.id,
          datuma: new Date(data.kereszteles.datuma),
          helye: data.kereszteles.helye ?? null,
          lelkeszNeve: data.kereszteles.lelkeszNeve ?? null,
        },
      });
    }
    if (data.konfirmacio) {
      await prisma.confirmation.create({
        data: {
          personId: person.id,
          datuma: new Date(data.konfirmacio.datuma),
          helye: data.konfirmacio.helye ?? null,
          lelkeszNeve: data.konfirmacio.lelkeszNeve ?? null,
        },
      });
    }
    if (data.koltozottHonnan) {
      await prisma.movingRequest.create({
        data: {
          personId: person.id,
          regiCim: data.koltozottHonnan,
          ujCim: "Jelenlegi gyülekezet",
          celGyulekezetId: data.gyulekezetId,
          status: "ELFOGADVA",
          elbiralva: new Date(),
        },
      });
    }
    if (data.tisztseg) {
      await prisma.position.create({
        data: { personId: person.id, gyulekezetId: data.gyulekezetId, tisztseg: data.tisztseg },
      });
    }

    return person;
  });

  app.put("/api/persons/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = personCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.person.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });

    const user = req.currentUser!;
    if (!canEditGyulekezet(user, existing.gyulekezetId) && !isAdmin(user)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const data = parsed.data;
    const person = await prisma.person.update({
      where: { id },
      data: {
        ...(data.vezeteknev !== undefined ? { vezeteknev: data.vezeteknev } : {}),
        ...(data.keresztnev !== undefined ? { keresztnev: data.keresztnev } : {}),
        ...(data.nem !== undefined ? { nem: data.nem } : {}),
        ...(data.szuletesiDatum !== undefined
          ? { szuletesiDatum: data.szuletesiDatum ? new Date(data.szuletesiDatum) : null }
          : {}),
        ...(data.szuletesiHely !== undefined ? { szuletesiHely: data.szuletesiHely } : {}),
        ...(data.vallas !== undefined ? { vallas: data.vallas } : {}),
        ...(data.csaladiAllapot !== undefined ? { csaladiAllapot: data.csaladiAllapot } : {}),
        ...(data.elhunyt !== undefined ? { elhunyt: data.elhunyt } : {}),
        ...(data.elhunytDatuma !== undefined
          ? { elhunytDatuma: data.elhunytDatuma ? new Date(data.elhunytDatuma) : null }
          : {}),
        ...(data.megjegyzes !== undefined ? { megjegyzes: data.megjegyzes } : {}),
        ...(data.nyitoTartozas !== undefined ? { nyitoTartozas: data.nyitoTartozas } : {}),
      },
    });

    if (data.elhunyt === true && !existing.elhunyt) {
      await applyWidowhoodCascade(id, person.elhunytDatuma);
    }

    if (data.kereszteles) {
      await prisma.baptism.upsert({
        where: { personId: id },
        create: {
          personId: id,
          datuma: new Date(data.kereszteles.datuma),
          helye: data.kereszteles.helye ?? null,
          lelkeszNeve: data.kereszteles.lelkeszNeve ?? null,
        },
        update: {
          datuma: new Date(data.kereszteles.datuma),
          helye: data.kereszteles.helye ?? null,
          lelkeszNeve: data.kereszteles.lelkeszNeve ?? null,
        },
      });
    }
    if (data.konfirmacio) {
      await prisma.confirmation.upsert({
        where: { personId: id },
        create: {
          personId: id,
          datuma: new Date(data.konfirmacio.datuma),
          helye: data.konfirmacio.helye ?? null,
          lelkeszNeve: data.konfirmacio.lelkeszNeve ?? null,
        },
        update: {
          datuma: new Date(data.konfirmacio.datuma),
          helye: data.konfirmacio.helye ?? null,
          lelkeszNeve: data.konfirmacio.lelkeszNeve ?? null,
        },
      });
    }

    return person;
  });

  // Rokoni kapcsolat hozzáadása (szülő-gyerek)
  app.post("/api/family-links", async (req, reply) => {
    const schema = z.object({ parentId: z.string(), childId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    if (
      !isAdmin(user) &&
      (!(await assertCanEditPerson(user, parsed.data.parentId)) ||
        !(await assertCanEditPerson(user, parsed.data.childId)))
    ) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const link = await prisma.familyLink.create({ data: parsed.data });
    return link;
  });

  // Rokoni kapcsolat (szülő-gyerek) törlése - pl. tévesen rögzített kapcsolat visszavonása.
  app.delete("/api/family-links/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const link = await prisma.familyLink.findUnique({ where: { id } });
    if (!link) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (
      !isAdmin(user) &&
      (!(await assertCanEditPerson(user, link.parentId)) || !(await assertCanEditPerson(user, link.childId)))
    ) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.familyLink.delete({ where: { id } });
    return { ok: true };
  });

  // Házasság rögzítése - a házastárs vagy egy meglévő Person (spouseBId), vagy egy
  // nem gyülekezeti tag külső személy (kulsoHazastarsNeve), de a kettő közül pontosan az egyik kötelező.
  app.post("/api/marriages", async (req, reply) => {
    const schema = z
      .object({
        spouseAId: z.string(),
        kulso: z.boolean(),
        spouseBId: z.string().optional().nullable(),
        kulsoHazastarsNeve: z.string().optional().nullable(),
        kulsoHazastarsVallasa: z.string().optional().nullable(),
        datuma: z.string().optional().nullable(),
        helye: z.string().optional().nullable(),
        lelkeszNeve: z.string().optional().nullable(),
      })
      .refine((d) => (d.kulso ? !d.spouseBId : !!d.spouseBId), {
        message: "Ha meglévő személyt választ, ne jelölje külsőnek; ha külső, ne adjon meg meglévő személyt",
      });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = req.currentUser!;
    const data = parsed.data;
    if (
      !isAdmin(user) &&
      (!(await assertCanEditPerson(user, data.spouseAId)) ||
        (data.spouseBId && !(await assertCanEditPerson(user, data.spouseBId))))
    ) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const marriage = await prisma.marriage.create({
      data: {
        spouseAId: data.spouseAId,
        spouseBId: data.kulso ? null : data.spouseBId ?? null,
        kulsoHazastarsNeve: data.kulso ? data.kulsoHazastarsNeve ?? null : null,
        kulsoHazastarsVallasa: data.kulso ? data.kulsoHazastarsVallasa ?? null : null,
        datuma: data.datuma ? new Date(data.datuma) : null,
        helye: data.helye ?? null,
        lelkeszNeve: data.lelkeszNeve ?? null,
      },
    });

    // Ha a házasság rögzítésekor mindkét fél él, a családi állapotukat "házas"-ra állítjuk (ha még nincs megadva mást felülíró okuk).
    await prisma.person.update({ where: { id: data.spouseAId }, data: { csaladiAllapot: "HAZAS" } });
    if (!data.kulso && data.spouseBId) {
      await prisma.person.update({ where: { id: data.spouseBId }, data: { csaladiAllapot: "HAZAS" } });
    }

    return marriage;
  });

  // Házasság lezárása: válás esetén mindkét fél (ha ismert) "elvált" státuszba kerül.
  // Elhalálozás esetén ez automatikusan megtörténik (lásd applyWidowhoodCascade), ide csak kézi felülírásra van szükség.
  app.put("/api/marriages/:id/end", async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ vegeOka: z.enum(["HALALOZAS", "VALAS"]), datuma: z.string().optional().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const marriage = await prisma.marriage.findUnique({ where: { id } });
    if (!marriage) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, marriage.spouseAId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    const vege = parsed.data.datuma ? new Date(parsed.data.datuma) : new Date();
    const updated = await prisma.marriage.update({
      where: { id },
      data: { vege, vegeOka: parsed.data.vegeOka },
    });

    if (parsed.data.vegeOka === "VALAS") {
      await prisma.person.update({ where: { id: marriage.spouseAId }, data: { csaladiAllapot: "ELVALT" } });
      if (marriage.spouseBId) {
        await prisma.person.update({ where: { id: marriage.spouseBId }, data: { csaladiAllapot: "ELVALT" } });
      }
    }

    return updated;
  });

  // Házasság végleges törlése - tévesen rögzített bejegyzés eltávolítására (nem ugyanaz, mint a
  // lezárás: az elválás/elhalálozás megtörtént eseményt jelöl, itt viszont maga a bejegyzés hibás).
  // A törlés után mindkét félnél újraszámoljuk a családi állapotot a MARADÉK házasságaik alapján -
  // ha van másik aktív házasságuk, marad "házas"; ha nincs, de van egy korábbi lezárt házasságuk,
  // annak oka alapján "özvegy"/"elvált" lesz; ha egyáltalán nem maradt házasságuk, "nőtlen/hajadon".
  app.delete("/api/marriages/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const marriage = await prisma.marriage.findUnique({ where: { id } });
    if (!marriage) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !(await assertCanEditPerson(user, marriage.spouseAId))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    await prisma.marriage.update({ where: { id }, data: { deletedAt: new Date() } });

    for (const spouseId of [marriage.spouseAId, marriage.spouseBId]) {
      if (!spouseId) continue;
      const remaining = await prisma.marriage.findMany({
        where: { OR: [{ spouseAId: spouseId }, { spouseBId: spouseId }] },
        orderBy: [{ vege: "desc" }],
      });
      const active = remaining.find((m) => !m.vege);
      if (active) {
        await prisma.person.update({ where: { id: spouseId }, data: { csaladiAllapot: "HAZAS" } });
      } else if (remaining.length > 0) {
        const csaladiAllapot = remaining[0].vegeOka === "HALALOZAS" ? "OZVEGY" : "ELVALT";
        await prisma.person.update({ where: { id: spouseId }, data: { csaladiAllapot } });
      } else {
        await prisma.person.update({ where: { id: spouseId }, data: { csaladiAllapot: "NOTLEN_HAJADON" } });
      }
    }

    return { ok: true };
  });

  // Személy törlése - NEM végleges: a személy (minden hozzá kapcsolódó adatával, rokoni
  // kapcsolatokkal, házasságokkal, befizetésekkel, háztartási tagsággal együtt, kaszkád nélkül)
  // a papírkosárba kerül, onnan bármikor visszaállítható (ld. trash.routes.ts).
  app.delete("/api/persons/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.person.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });

    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    await prisma.person.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
