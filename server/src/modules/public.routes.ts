import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { ageOn } from "../lib/age.js";

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

    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

    const eredmeny = await Promise.all(
      gyulekezetek.map(async (g) => {
        const [tagletszam, elhunytakEbbenAzEvben, eloTagok] = await Promise.all([
          prisma.person.count({ where: { gyulekezetId: g.id, elhunyt: false } }),
          prisma.person.count({
            where: { gyulekezetId: g.id, elhunyt: true, elhunytDatuma: { gte: yearStart, lt: yearEnd } },
          }),
          prisma.person.findMany({
            where: { gyulekezetId: g.id, elhunyt: false, szuletesiDatum: { not: null } },
            select: { szuletesiDatum: true },
          }),
        ]);

        const korBuckets = [
          { label: "0–14 év", min: 0, max: 14, count: 0 },
          { label: "15–29 év", min: 15, max: 29, count: 0 },
          { label: "30–49 év", min: 30, max: 49, count: 0 },
          { label: "50–64 év", min: 50, max: 64, count: 0 },
          { label: "65+ év", min: 65, max: 999, count: 0 },
        ];
        for (const p of eloTagok) {
          if (!p.szuletesiDatum) continue;
          const age = ageOn(p.szuletesiDatum, now);
          const bucket = korBuckets.find((b) => age >= b.min && age <= b.max);
          if (bucket) bucket.count++;
        }

        return {
          nev: g.nev,
          slug: g.publicSlug,
          tagletszam,
          elhunytakEbbenAzEvben,
          korEloszlas: korBuckets.map((b) => ({ label: b.label, count: b.count })),
        };
      }),
    );

    return { ev: now.getUTCFullYear(), gyulekezetek: eredmeny };
  });
}
