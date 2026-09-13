import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

/**
 * Hitelesítés nélküli, kizárólag összesített (nem személyes) adatokat kiadó végpont a
 * gyülekezet nyilvános honlapja számára - ezért a globális CORS-korlátozástól (ALLOWED_ORIGINS)
 * eltérően itt bármely origin engedélyezett, mivel a válasz nem tartalmaz sem hitelesítő
 * adatot, sem egyéni személyre visszavezethető adatot.
 */
export async function publicRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { slugs?: string } }>("/api/public/stats", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const slugs = (req.query.slugs ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length === 0) {
      return reply.code(400).send({ error: "Hiányzó 'slugs' paraméter" });
    }

    const gyulekezetek = await prisma.gyulekezet.findMany({
      where: { publicSlug: { in: slugs } },
      select: { id: true, nev: true, publicSlug: true },
    });
    if (gyulekezetek.length === 0) {
      return reply.code(404).send({ error: "Nem található nyilvános gyülekezet ilyen azonosítóval" });
    }
    const gyulekezetIds = gyulekezetek.map((g) => g.id);

    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

    const [elolevok, elhunytakEbbenAzEvben] = await Promise.all([
      prisma.person.count({
        where: { gyulekezetId: { in: gyulekezetIds }, elhunyt: false },
      }),
      prisma.person.count({
        where: {
          gyulekezetId: { in: gyulekezetIds },
          elhunyt: true,
          elhunytDatuma: { gte: yearStart, lt: yearEnd },
        },
      }),
    ]);

    return {
      ev: now.getUTCFullYear(),
      tagletszam: elolevok,
      elhunytakEbbenAzEvben,
      gyulekezetek: gyulekezetek.map((g) => ({ nev: g.nev, slug: g.publicSlug })),
    };
  });
}
