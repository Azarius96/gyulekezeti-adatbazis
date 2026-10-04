import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, canEditGyulekezet, canAccessGyulekezet, isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

export async function orgRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/gyulekezetek", async (req) => {
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    const where = accessible === "ALL" ? {} : { id: { in: accessible } };
    return prisma.gyulekezet.findMany({
      where,
      select: {
        id: true,
        nev: true,
        egyhazmegyeId: true,
        egyhazmegye: { select: { id: true, nev: true } },
        _count: { select: { persons: true } },
      },
      orderBy: { nev: "asc" },
    });
  });

  // Admin: minden gyülekezet a hozzárendelt lelkészekkel/felhasználókkal együtt (áttekintéshez)
  app.get("/api/gyulekezetek/attekintes", async (req, reply) => {
    const user = req.currentUser!;
    if (!isAdmin(user)) return reply.code(403).send({ error: "Csak rendszergazda érheti el" });
    const gyulekezetek = await prisma.gyulekezet.findMany({
      include: {
        userRoles: { include: { user: { select: { id: true, nev: true, email: true, active: true } } } },
        _count: { select: { persons: true } },
      },
      orderBy: { nev: "asc" },
    });
    return gyulekezetek.map((g) => ({
      id: g.id,
      nev: g.nev,
      _count: g._count,
      users: g.userRoles.map((ur) => ({
        id: ur.user.id,
        nev: ur.user.nev,
        email: ur.user.email,
        active: ur.user.active,
        szerepKor: ur.szerepKor,
      })),
    }));
  });

  // Lelkész első belépéskor létrehozhatja a saját gyülekezetét, ha van "gazdátlan" LELKESZ szerepköre
  app.post("/api/gyulekezetek", async (req, reply) => {
    const user = req.currentUser!;
    const pendingLelkeszRole = user.roles.find((r) => r.szerepKor === "LELKESZ" && !r.gyulekezetId);

    if (!isAdmin(user) && !pendingLelkeszRole) {
      return reply.code(403).send({ error: "Nincs jogosultság gyülekezet létrehozásához" });
    }

    const schema = z.object({
      nev: z.string().min(1),
      publicAddress: z.string().optional().nullable(),
      // A román nyelvű cím és a postacím külön kérése már gyülekezet-létrehozáskor megelőzi, hogy
      // a román nyelvű hivatalos iratokon utólag kelljen pótolni a helyes (nem magyar) településnevet.
      romanCim: z.string().optional().nullable(),
      postaiCim: z.string().optional().nullable(),
      egyhazmegyeId: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    let egyhazmegyeId = parsed.data.egyhazmegyeId ?? null;
    if (!egyhazmegyeId) {
      // egyelőre egyetlen alap egyházmegye alá kerül, ha nincs megadva - adminisztrátor később átszervezheti
      let egyhazmegye = await prisma.egyhazmegye.findFirst();
      if (!egyhazmegye) {
        const kerulet = await prisma.kerulet.create({ data: { nev: "Beosztatlan kerület" } });
        egyhazmegye = await prisma.egyhazmegye.create({ data: { nev: "Beosztatlan egyházmegye", keruletId: kerulet.id } });
      }
      egyhazmegyeId = egyhazmegye.id;
    }

    const gyulekezet = await prisma.gyulekezet.create({
      data: {
        nev: parsed.data.nev,
        publicAddress: parsed.data.publicAddress ?? null,
        romanCim: parsed.data.romanCim ?? null,
        postaiCim: parsed.data.postaiCim ?? null,
        egyhazmegyeId,
      },
    });

    if (pendingLelkeszRole) {
      await prisma.userRole.update({ where: { id: pendingLelkeszRole.id }, data: { gyulekezetId: gyulekezet.id } });
    }

    return gyulekezet;
  });

  app.get("/api/gyulekezetek/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !(await canAccessGyulekezet(user, id))) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const gyulekezet = await prisma.gyulekezet.findUnique({
      where: { id },
      include: {
        _count: { select: { persons: true, households: true } },
        egyhazmegye: { include: { kerulet: true } },
      },
    });
    if (!gyulekezet) return reply.code(404).send({ error: "Nem található" });

    // A hivatalos levélfejléchez (pl. letölthető dokumentumokhoz) hasznos a szolgáló lelkész és
    // gondnok neve is - ugyanaz a lekérdezés, mint a valasztok.routes.ts suggestSigners függvényében.
    const [lelkeszRole, gondnok] = await Promise.all([
      prisma.userRole.findFirst({ where: { gyulekezetId: id, szerepKor: "LELKESZ" }, include: { user: true } }),
      prisma.position.findFirst({
        where: { gyulekezetId: id, tisztseg: { in: ["GONDNOK", "FOGONDNOK"] }, vege: null },
        include: { person: true },
        orderBy: { kezdete: "desc" },
      }),
    ]);

    return {
      ...gyulekezet,
      lelkeszNev: lelkeszRole?.user.nev ?? "",
      gondnokNev: gondnok ? `${gondnok.person.vezeteknev} ${gondnok.person.keresztnev}` : "",
    };
  });

  app.put("/api/gyulekezetek/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, id)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({
      nev: z.string().min(1).optional(),
      egyhazmegyeId: z.string().optional(),
      publicAddress: z.string().optional().nullable(),
      publicDescription: z.string().optional().nullable(),
      publicContact: z.string().optional().nullable(),
      publicServiceInfo: z.string().optional().nullable(),
      codFiscal: z.string().optional().nullable(),
      romanCim: z.string().optional().nullable(),
      postaiCim: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const gyulekezet = await prisma.gyulekezet.update({ where: { id }, data: parsed.data });
    return gyulekezet;
  });

  app.get("/api/gyulekezetek/:id/beallitasok", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, id)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const [duesConfigs, gravePriceConfigs] = await Promise.all([
      prisma.churchDuesConfig.findMany({
        where: { gyulekezetId: id },
        orderBy: [{ ervenyesEttolEv: "desc" }, { korhatarTol: "asc" }],
      }),
      prisma.gravePriceConfig.findMany({ where: { gyulekezetId: id }, orderBy: { ervenyesEttolEv: "desc" } }),
    ]);
    return { duesConfigs, gravePriceConfigs };
  });

  app.post("/api/gyulekezetek/:id/dues-config", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, id)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({
      korhatarTol: z.number().int().min(0),
      korhatarIg: z.number().int().min(0),
      osszeg: z.number().nonnegative(),
      ervenyesEttolEv: z.number().int().min(1900).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const config = await prisma.churchDuesConfig.create({
      data: {
        gyulekezetId: id,
        korhatarTol: parsed.data.korhatarTol,
        korhatarIg: parsed.data.korhatarIg,
        osszeg: parsed.data.osszeg,
        ervenyesEttolEv: parsed.data.ervenyesEttolEv,
      },
    });
    return config;
  });

  // Meglévő korsáv/összeg módosítása vagy törlése - minden gyülekezet szabadon
  // átállíthatja a saját egyházfenntartói díjszabását (korhatárok, összegek, mentességek),
  // évekre lebontva (minden korsáv-generáció egy adott évtől érvényes).
  const duesConfigEditSchema = z.object({
    korhatarTol: z.number().int().min(0).optional(),
    korhatarIg: z.number().int().min(0).optional(),
    osszeg: z.number().nonnegative().optional(),
    ervenyesEttolEv: z.number().int().min(1900).max(3000).optional(),
  });

  // Egy korsáv-generáció (ervenyesEttolEv) a lezárt (múltbeli) évek díjszámításának alapja -
  // ha ezt utólag átírnánk vagy törölnénk, minden azt az évet érintő korábbi kimutatás
  // (tartozáslista, lélekszám jelentés stb.) csendben, nyom nélkül megváltozna. Ezért egy
  // generáció alapból csak addig módosítható/törölhető, amíg a folyó vagy jövőbeli évtől érvényes -
  // egy már lezárt évet érintő változtatáshoz új generációt kell indítani (ld. "Másolás"). Ha a
  // felhasználó a figyelmeztetés után mégis visszamenőleg akarja módosítani (pl. elírt korhatár
  // javítása), a kérés `?megerosit=1` paraméterrel felülírhatja a védelmet.
  function assertNemLezartGeneracio(
    ervenyesEttolEv: number,
    reply: import("fastify").FastifyReply,
    megerosit: boolean
  ): boolean {
    const folyoEv = new Date().getFullYear();
    if (ervenyesEttolEv < folyoEv && !megerosit) {
      reply.code(409).send({
        error:
          "Ez a korsáv egy korábbi, már lezárt évtől érvényes - visszamenőleges módosítása meghamisítaná a már rögzített évek adatait. Ha a díjat a jelenlegi vagy egy jövőbeli évtől szeretné megváltoztatni, hozzon létre új korsávot a Másolás gombbal.",
        megerosithato: true,
      });
      return false;
    }
    return true;
  }

  app.put("/api/dues-config/:configId", async (req, reply) => {
    const { configId } = req.params as { configId: string };
    const existing = await prisma.churchDuesConfig.findUnique({ where: { id: configId } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const megerosit = (req.query as { megerosit?: string }).megerosit === "1";
    if (!assertNemLezartGeneracio(existing.ervenyesEttolEv, reply, megerosit)) return;
    const parsed = duesConfigEditSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    if (parsed.data.ervenyesEttolEv !== undefined && !assertNemLezartGeneracio(parsed.data.ervenyesEttolEv, reply, megerosit)) return;
    const config = await prisma.churchDuesConfig.update({ where: { id: configId }, data: parsed.data });
    return config;
  });

  app.delete("/api/dues-config/:configId", async (req, reply) => {
    const { configId } = req.params as { configId: string };
    const existing = await prisma.churchDuesConfig.findUnique({ where: { id: configId } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const megerosit = (req.query as { megerosit?: string }).megerosit === "1";
    if (!assertNemLezartGeneracio(existing.ervenyesEttolEv, reply, megerosit)) return;
    await prisma.churchDuesConfig.update({ where: { id: configId }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  app.post("/api/gyulekezetek/:id/grave-price-config", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, id)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const schema = z.object({
      ervenyessegEv: z.number().int().min(1),
      osszeg: z.number().nonnegative(),
      ervenyesEttolEv: z.number().int().min(1900).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const config = await prisma.gravePriceConfig.create({
      data: {
        gyulekezetId: id,
        ervenyessegEv: parsed.data.ervenyessegEv,
        osszeg: parsed.data.osszeg,
        ervenyesEttolEv: parsed.data.ervenyesEttolEv,
      },
    });
    return config;
  });

  const gravePriceEditSchema = z.object({
    ervenyessegEv: z.number().int().min(1).optional(),
    osszeg: z.number().nonnegative().optional(),
    ervenyesEttolEv: z.number().int().min(1900).max(3000).optional(),
  });

  app.put("/api/grave-price-config/:configId", async (req, reply) => {
    const { configId } = req.params as { configId: string };
    const existing = await prisma.gravePriceConfig.findUnique({ where: { id: configId } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const parsed = gravePriceEditSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const config = await prisma.gravePriceConfig.update({ where: { id: configId }, data: parsed.data });
    return config;
  });

  app.delete("/api/grave-price-config/:configId", async (req, reply) => {
    const { configId } = req.params as { configId: string };
    const existing = await prisma.gravePriceConfig.findUnique({ where: { id: configId } });
    if (!existing) return reply.code(404).send({ error: "Nem található" });
    const user = req.currentUser!;
    if (!isAdmin(user) && !canEditGyulekezet(user, existing.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    await prisma.gravePriceConfig.update({ where: { id: configId }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // Gyülekezet törlése - kizárólag rendszergazda, és csak explicit megerősítéssel. Nem véglegesen
  // töröl: a gyülekezet (minden hozzá tartozó adatával együtt, kaszkád nélkül) a papírkosárba
  // kerül, onnan az admin bármikor visszaállíthatja (ld. trash.routes.ts).
  app.delete("/api/gyulekezetek/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isAdmin(user)) {
      return reply.code(403).send({ error: "Csak rendszergazda törölhet gyülekezetet" });
    }
    const gyulekezet = await prisma.gyulekezet.findUnique({ where: { id } });
    if (!gyulekezet) return reply.code(404).send({ error: "Nem található" });

    const schema = z.object({ megerositesNev: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || parsed.data.megerositesNev !== gyulekezet.nev) {
      return reply.code(400).send({
        error: "A megerősítéshez pontosan be kell írni a gyülekezet nevét",
      });
    }

    await prisma.gyulekezet.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
