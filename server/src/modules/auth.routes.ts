import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../auth/jwt.js";
import { isPaymentExpired, type AuthUser } from "../auth/scope.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Hibás adatok" });
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email }, include: { roles: true } });

    // Azonos, nem informatív hibaüzenet minden sikertelen esetben (nincs felhasználó-enumeráció).
    const genericError = () => reply.code(401).send({ error: "Hibás e-mail vagy jelszó" });

    if (!user || !user.active) {
      return genericError();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return reply.code(423).send({
        error: "A fiók átmenetileg zárolva van a sok sikertelen bejelentkezési kísérlet miatt. Próbálja újra később.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const LOCK_THRESHOLD = 5;
      const LOCK_MINUTES = 15;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      return genericError();
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (isPaymentExpired(user as AuthUser)) {
      return reply.code(402).send({
        error: "Lejárt a fiókjához tartozó fizetési határidő. A hozzáférés újbóli aktiválásához kérjük, vegye fel a kapcsolatot a rendszergazdával.",
      });
    }

    const token = signToken({ userId: user.id });
    reply.setCookie("token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    const roles = await prisma.userRole.findMany({ where: { userId: user.id } });
    return { id: user.id, nev: user.nev, email: user.email, roles };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie("token", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!req.currentUser) {
      return reply.code(401).send({ error: "Nincs bejelentkezve" });
    }
    const u = req.currentUser;
    return {
      id: u.id,
      nev: u.nev,
      email: u.email,
      roles: u.roles,
      paymentValidUntil: u.paymentValidUntil,
    };
  });
}
