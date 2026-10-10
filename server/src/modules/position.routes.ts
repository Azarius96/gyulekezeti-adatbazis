import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canEditGyulekezet, isAdmin } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

const TISZTSEGEK = ["PRESBITER", "POTPRESBITER", "GONDNOK", "FOGONDNOK", "NOSZOVETSEGI_TAG"] as const;

export async function positionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/api/positions", async (req, reply) => {
    const schema = z.object({
      personId: z.string(),
      tisztseg: z.enum(TISZTSEGEK),
      kezdete: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Hibás adatok" });

    const user = req.currentUser!;
    const person = await prisma.person.findUnique({ where: { id: parsed.data.personId } });
    if (!person) return reply.code(404).send({ error: "Nem található" });
    if (!isAdmin(user) && !canEditGyulekezet(user, person.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    if (person.elhunyt) return reply.code(400).send({ error: "Elhunyt személyhez nem rögzíthető tisztség" });

    const position = await prisma.position.create({
      data: {
        personId: person.id,
        gyulekezetId: person.gyulekezetId,
        tisztseg: parsed.data.tisztseg,
        kezdete: parsed.data.kezdete ? new Date(parsed.data.kezdete) : new Date(),
      },
    });
    return position;
  });

  app.put("/api/positions/:id/end", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    const position = await prisma.position.findUnique({ where: { id } });
    if (!position) return reply.code(404).send({ error: "Nem található" });
    if (!isAdmin(user) && !canEditGyulekezet(user, position.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const updated = await prisma.position.update({ where: { id }, data: { vege: new Date() } });
    return updated;
  });
}
