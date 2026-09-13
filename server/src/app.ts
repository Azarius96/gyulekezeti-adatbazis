import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./modules/auth.routes.js";
import { personRoutes } from "./modules/person.routes.js";
import { householdRoutes } from "./modules/household.routes.js";
import { orgRoutes } from "./modules/org.routes.js";
import { dashboardRoutes } from "./modules/dashboard.routes.js";
import { importRoutes } from "./modules/import.routes.js";
import { userRoutes } from "./modules/user.routes.js";
import { positionRoutes } from "./modules/position.routes.js";
import { duesRoutes } from "./modules/dues.routes.js";
import { eventsRoutes } from "./modules/events.routes.js";
import { orgStructureRoutes } from "./modules/orgStructure.routes.js";
import { cemeteryRoutes } from "./modules/cemetery.routes.js";
import { anyakonyvRoutes } from "./modules/anyakonyv.routes.js";
import { backupRoutes } from "./modules/backup.routes.js";
import { exportRoutes } from "./modules/export.routes.js";
import { teendokRoutes } from "./modules/teendok.routes.js";
import { valasztokRoutes } from "./modules/valasztok.routes.js";
import { lelekszamRoutes } from "./modules/lelekszam.routes.js";
import { auditRoutes } from "./modules/audit.routes.js";
import { trashRoutes } from "./modules/trash.routes.js";
import { movingRoutes } from "./modules/moving.routes.js";
import { withRequestContext } from "./lib/requestContext.js";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",");

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  // A kérés teljes életciklusát átfogó kontextus, hogy a Prisma audit-naplózó rétege (lib/prisma.ts)
  // bármely mélyen futó adatbázis-műveletnél tudja, KI hajtja azt végre - ennek a legelső hook-nak
  // kell lennie, mielőtt bármelyik más (pl. auth) hook lefutna.
  app.addHook("onRequest", (_req, _reply, done) => {
    withRequestContext(done);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    // Az API-t szándékosan más origin (a webes kliens) hívja CORS-on keresztül,
    // ezért a CORP-ot ehhez az architektúrához kell igazítani, nem same-origin-re zárni.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // HSTS csak production/HTTPS mögött hasznos; helyi http fejlesztésen a böngésző
    // örökre https-re kényszerítené a localhost-ot, ha itt bekapcsolva maradna.
    hsts: process.env.NODE_ENV === "production",
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(cors, {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(personRoutes);
  await app.register(householdRoutes);
  await app.register(orgRoutes);
  await app.register(dashboardRoutes);
  await app.register(importRoutes);
  await app.register(userRoutes);
  await app.register(positionRoutes);
  await app.register(duesRoutes);
  await app.register(eventsRoutes);
  await app.register(orgStructureRoutes);
  await app.register(cemeteryRoutes);
  await app.register(anyakonyvRoutes);
  await app.register(backupRoutes);
  await app.register(exportRoutes);
  await app.register(teendokRoutes);
  await app.register(valasztokRoutes);
  await app.register(lelekszamRoutes);
  await app.register(auditRoutes);
  await app.register(trashRoutes);
  await app.register(movingRoutes);

  app.get("/api/health", async () => ({ ok: true }));

  // Éles környezetben (egyetlen Docker image-ben) ez a szerver szolgálja ki magát a
  // lebuildelt React frontendet is, ugyanarról az originről - így nincs szükség CORS-ra a
  // böngésző és a szerver között, és a frontendnek build-időben sem kell tudnia a nyilvános
  // domaint (ld. web/src/lib/api.ts). Az útvonalat a WEB_DIST_PATH környezeti változó adja
  // meg (a Dockerfile ide másolja a "web" build kimenetét); ha nincs beállítva vagy a mappa
  // nem létezik (pl. helyi fejlesztés, ahol a Vite dev-szerver szolgálja ki a frontendet),
  // egyszerűen kimarad ez a rész.
  const webDistPath = process.env.WEB_DIST_PATH;
  if (webDistPath && fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, { root: webDistPath, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api/")) {
        return reply.code(404).send({ error: "Nem található" });
      }
      return reply.sendFile("index.html", webDistPath);
    });
  }

  return app;
}
