import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, prismaIncludingDeleted } from "../lib/prisma.js";
import { isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.currentUser || !isAdmin(req.currentUser)) {
    reply.code(403).send({ error: "Csak rendszergazda érheti el" });
    return false;
  }
  return true;
}

const roleSchema = z.object({
  szerepKor: z.enum(["ADMIN", "PUSPOK", "ESPERES", "LELKESZ", "DELEGALT"]),
  gyulekezetId: z.string().optional().nullable(),
  egyhazmegyeId: z.string().optional().nullable(),
  keruletId: z.string().optional().nullable(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  nev: z.string().min(1),
  password: z.string().min(10, "A jelszónak legalább 10 karakter hosszúnak kell lennie"),
  roles: z.array(roleSchema).min(1, "Legalább egy szerepkört meg kell adni"),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nev: true,
        active: true,
        createdAt: true,
        lockedUntil: true,
        roles: true,
        paymentPaidAt: true,
        paymentValidUntil: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return users;
  });

  // A törölt (deletedAt != null) felhasználók külön listája - a papírkosárhoz hasonlóan innen
  // visszaállíthatók, de mivel a jogosultság itt nem gyülekezethez köthető (egy admin/esperes
  // fiók több/semelyik gyülekezethez sem tartozik), ez szándékosan nem az általános papírkosár
  // része, hanem csak rendszergazda számára elérhető, közvetlenül a Felhasználók oldalon.
  app.get("/api/users/deleted", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const users = await prismaIncludingDeleted.user.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, email: true, nev: true, deletedAt: true, roles: true },
      orderBy: { deletedAt: "desc" },
    });
    return users;
  });

  app.delete("/api/users/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    if (req.currentUser!.id === id) {
      return reply.code(400).send({ error: "Saját fiókját nem törölheti" });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "Nem található" });
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    return { ok: true };
  });

  app.post("/api/users/:id/restore", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const user = await prismaIncludingDeleted.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "Nem található" });
    if (user.deletedAt == null) return reply.code(409).send({ error: "Ez a felhasználó nincs törölve" });
    const restored = await prisma.user.update({ where: { id }, data: { deletedAt: null } });
    return restored;
  });

  app.post("/api/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return reply.code(409).send({ error: "Ez az e-mail cím már használatban van" });

    for (const role of data.roles) {
      if ((role.szerepKor === "LELKESZ" || role.szerepKor === "DELEGALT") && !role.gyulekezetId) {
        return reply.code(400).send({ error: "Lelkész/delegált szerepkörhöz gyülekezet megadása kötelező" });
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        nev: data.nev,
        passwordHash,
        roles: {
          create: data.roles.map((r) => ({
            szerepKor: r.szerepKor,
            gyulekezetId: r.gyulekezetId ?? null,
            egyhazmegyeId: r.egyhazmegyeId ?? null,
            keruletId: r.keruletId ?? null,
          })),
        },
      },
      select: { id: true, email: true, nev: true, roles: true },
    });
    return user;
  });

  app.post("/api/users/:id/roles", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    if ((parsed.data.szerepKor === "LELKESZ" || parsed.data.szerepKor === "DELEGALT") && !parsed.data.gyulekezetId) {
      return reply.code(400).send({ error: "Lelkész/delegált szerepkörhöz gyülekezet megadása kötelező" });
    }
    const role = await prisma.userRole.create({
      data: {
        userId: id,
        szerepKor: parsed.data.szerepKor,
        gyulekezetId: parsed.data.gyulekezetId ?? null,
        egyhazmegyeId: parsed.data.egyhazmegyeId ?? null,
        keruletId: parsed.data.keruletId ?? null,
      },
    });
    return role;
  });

  app.delete("/api/users/:id/roles/:roleId", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { roleId } = req.params as { id: string; roleId: string };
    await prisma.userRole.delete({ where: { id: roleId } });
    return { ok: true };
  });

  app.put("/api/users/:id/password", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const schema = z.object({ password: z.string().min(10, "A jelszónak legalább 10 karakter hosszúnak kell lennie") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    // Az adminisztrátor általi jelszó-beállítás egyben feloldja a fiókot is (pl. ha korábbi
    // sikertelen belépési kísérletek miatt zárolva volt) - új jelszóval úgyis újra kell tudnia
    // belépni a felhasználónak.
    const user = await prisma.user.update({
      where: { id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true },
    });
    return { ok: true, id: user.id };
  });

  app.put("/api/users/:id/active", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const schema = z.object({ active: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = await prisma.user.update({
      where: { id },
      data: { active: parsed.data.active, ...(parsed.data.active ? { failedLoginAttempts: 0, lockedUntil: null } : {}) },
      select: { id: true, active: true },
    });
    return user;
  });

  // Fizetési határidő rögzítése/módosítása egy felhasználóhoz (jellemzően lelkészi fiókhoz) -
  // mindkét mező nullázható, ha törölni kell a korlátozást.
  app.put("/api/users/:id/payment", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const schema = z.object({
      paymentPaidAt: z.string().nullable(),
      paymentValidUntil: z.string().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });
    const user = await prisma.user.update({
      where: { id },
      data: {
        paymentPaidAt: parsed.data.paymentPaidAt ? new Date(parsed.data.paymentPaidAt) : null,
        paymentValidUntil: parsed.data.paymentValidUntil ? new Date(parsed.data.paymentValidUntil) : null,
      },
      select: { id: true, paymentPaidAt: true, paymentValidUntil: true },
    });
    return user;
  });
}
