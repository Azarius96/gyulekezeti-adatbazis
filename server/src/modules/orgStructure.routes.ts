import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { isAdmin, getAccessibleGyulekezetIds } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

const GONDNOK_TISZTSEGEK = ["GONDNOK", "FOGONDNOK"];
const PRESBITER_TISZTSEGEK = ["PRESBITER", "POTPRESBITER"];

export async function orgStructureRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // A kerület/egyházmegye lista bármely bejelentkezett felhasználónak látható (szervezeti alapadat,
  // szükséges pl. ahhoz, hogy egy lelkész be tudja állítani, melyik egyházmegyéhez tartozik).
  app.get("/api/keruletek", async () => {
    return prisma.kerulet.findMany({ orderBy: { nev: "asc" } });
  });

  app.post("/api/keruletek", async (req, reply) => {
    const user = req.currentUser!;
    if (!isAdmin(user)) return reply.code(403).send({ error: "Csak rendszergazda hozhat létre kerületet" });
    const schema = z.object({ nev: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    return prisma.kerulet.create({ data: { nev: parsed.data.nev } });
  });

  app.put("/api/keruletek/:id", async (req, reply) => {
    const user = req.currentUser!;
    if (!isAdmin(user)) return reply.code(403).send({ error: "Csak rendszergazda szerkesztheti" });
    const { id } = req.params as { id: string };
    const schema = z.object({ nev: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    return prisma.kerulet.update({ where: { id }, data: { nev: parsed.data.nev } });
  });

  app.get("/api/egyhazmegyek", async () => {
    return prisma.egyhazmegye.findMany({
      include: { kerulet: { select: { id: true, nev: true } } },
      orderBy: { nev: "asc" },
    });
  });

  app.post("/api/egyhazmegyek", async (req, reply) => {
    const user = req.currentUser!;
    if (!isAdmin(user)) return reply.code(403).send({ error: "Csak rendszergazda hozhat létre egyházmegyét" });
    const schema = z.object({ nev: z.string().min(1), keruletId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    return prisma.egyhazmegye.create({ data: parsed.data });
  });

  app.put("/api/egyhazmegyek/:id", async (req, reply) => {
    const user = req.currentUser!;
    if (!isAdmin(user)) return reply.code(403).send({ error: "Csak rendszergazda szerkesztheti" });
    const { id } = req.params as { id: string };
    const schema = z.object({ nev: z.string().min(1).optional(), keruletId: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    return prisma.egyhazmegye.update({ where: { id }, data: parsed.data });
  });

  // Gyülekezetek a szervezeti felépítés nézethez, a lelkészükkel/gondnokukkal/presbitereikkel
  // együtt. Admin az összes regisztrált gyülekezetet látja; más felhasználó csak a sajátjait
  // (amelyekhez lelkészként/delegáltként hozzá van rendelve) - ugyanaz a hatókör, mint amit
  // getAccessibleGyulekezetIds a többi modulban is használ.
  app.get("/api/szervezet/gyulekezetek", async (req, reply) => {
    const user = req.currentUser!;
    const accessible = await getAccessibleGyulekezetIds(user);
    if (accessible !== "ALL" && accessible.length === 0) return [];

    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: accessible === "ALL" ? {} : { id: { in: accessible } },
      include: {
        egyhazmegye: { select: { nev: true, kerulet: { select: { nev: true } } } },
        userRoles: {
          where: { szerepKor: "LELKESZ" },
          include: { user: { select: { id: true, nev: true, email: true, active: true } } },
        },
        positions: {
          where: { tisztseg: { in: [...GONDNOK_TISZTSEGEK, ...PRESBITER_TISZTSEGEK] }, vege: null },
          include: { person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
          orderBy: { person: { vezeteknev: "asc" } },
        },
      },
      orderBy: { nev: "asc" },
    });

    return gyulekezetek.map((g) => ({
      id: g.id,
      nev: g.nev,
      egyhazmegyeNev: g.egyhazmegye.nev,
      keruletNev: g.egyhazmegye.kerulet.nev,
      lelkeszek: g.userRoles.map((ur) => ({ id: ur.user.id, nev: ur.user.nev, email: ur.user.email, active: ur.user.active })),
      gondnokok: g.positions
        .filter((p) => GONDNOK_TISZTSEGEK.includes(p.tisztseg))
        .map((p) => ({ id: p.person.id, nev: `${p.person.vezeteknev} ${p.person.keresztnev}`, tisztseg: p.tisztseg })),
      presbiterek: g.positions
        .filter((p) => PRESBITER_TISZTSEGEK.includes(p.tisztseg))
        .map((p) => ({ id: p.person.id, nev: `${p.person.vezeteknev} ${p.person.keresztnev}`, tisztseg: p.tisztseg })),
    }));
  });
}
