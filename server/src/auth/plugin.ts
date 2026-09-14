import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "./jwt.js";
import { prisma } from "../lib/prisma.js";
import { setCurrentActor } from "../lib/requestContext.js";
import { isPaymentExpired, type AuthUser } from "./scope.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: AuthUser | null;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("currentUser", null);

  app.addHook("preHandler", async (req: FastifyRequest) => {
    const token = req.cookies?.token;
    if (!token) return;
    const payload = verifyToken(token);
    if (!payload) return;
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { roles: true } });
    // Lejárt fizetési határidő esetén a munkamenet - annak ellenére, hogy a süti/token még
    // érvényes - úgy viselkedik, mintha a felhasználó nem lenne bejelentkezve (a lekérdezések
    // 401-et adnak vissza), így az elavult fizetés a következő bejelentkezési kísérletkor a
    // login-végponton keresztül kap konkrét hibaüzenetet, nem itt egy általános API-hívásnál.
    if (user && user.active && !isPaymentExpired(user)) {
      req.currentUser = user;
      setCurrentActor({ userId: user.id, userNev: user.nev });
    }
  });
});

export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!req.currentUser) {
    reply.code(401).send({ error: "Bejelentkezés szükséges" });
    return;
  }
  done();
}
