import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { isAdmin } from "../auth/scope.js";
import {
  buildPersonTemplate,
  buildCemeteryTemplate,
  parsePersonWorkbook,
  parseCemeteryWorkbook,
} from "./importExcel.js";
import { checkDuplicate, normalizeName } from "./duplicateCheck.js";
import { applyWidowhoodCascade } from "./family.js";

function ageOn(birth: Date, ref: Date): number {
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

async function readUpload(req: any): Promise<{ buffer: Buffer; gyulekezetId: string } | null> {
  let buffer: Buffer | null = null;
  let gyulekezetId: string | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      buffer = await part.toBuffer();
    } else if (part.fieldname === "gyulekezetId") {
      gyulekezetId = String(part.value);
    }
  }
  if (!buffer || !gyulekezetId) return null;
  return { buffer, gyulekezetId };
}

export async function importRoutes(app: FastifyInstance) {
  // Az Excel import (sablon letöltés + feltöltés) kizárólag rendszergazda számára elérhető.
  app.addHook("preHandler", (req, reply, done) => {
    if (!req.currentUser || !isAdmin(req.currentUser)) {
      reply.code(403).send({ error: "Csak rendszergazda érheti el" });
      return;
    }
    done();
  });

  app.get("/api/import/persons-template", async (_req, reply) => {
    const workbook = buildPersonTemplate();
    const buffer = await workbook.xlsx.writeBuffer();
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="szemelyek_sablon.xlsx"')
      .send(buffer);
  });

  app.get("/api/import/cemetery-template", async (_req, reply) => {
    const workbook = buildCemeteryTemplate();
    const buffer = await workbook.xlsx.writeBuffer();
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="temeto_sablon.xlsx"')
      .send(buffer);
  });

  app.post("/api/import/persons", async (req, reply) => {
    const upload = await readUpload(req);
    if (!upload) return reply.code(400).send({ error: "Hiányzó fájl vagy gyülekezet" });

    const rows = await parsePersonWorkbook(upload.buffer);

    const created: string[] = [];
    const skippedDuplicates: string[] = [];
    const warnings: string[] = [];

    // cím -> household id (meglévők betöltése + újak létrehozása igény szerint)
    const householdCache = new Map<string, string>();
    // normalizált név -> ebben a feltöltésben most létrehozott personId (házastárs-összekapcsoláshoz)
    const createdByName = new Map<string, string>();
    // (personId, sor) párok, ahol házastárs-összekapcsolást még el kell végezni
    const pendingSpouseLinks: {
      personId: string;
      hazastarsVezeteknev: string;
      hazastarsKeresztnev: string;
      esketesDatuma: string | null;
      esketesHelye: string | null;
      esketesLelkesze: string | null;
      rowNumber: number;
    }[] = [];

    for (const row of rows) {
      const szuletesiDatum = row.szuletesiDatum ? new Date(row.szuletesiDatum) : null;
      const dup = await checkDuplicate(upload.gyulekezetId, row.vezeteknev, row.keresztnev, szuletesiDatum);

      if (dup.verdict === "EXACT") {
        skippedDuplicates.push(
          `${row.rowNumber}. sor: ${row.vezeteknev} ${row.keresztnev} — már létezik ilyen nevű és születési évű személy, kihagyva`
        );
        continue;
      }
      if (dup.verdict === "UNCERTAIN" && dup.match) {
        warnings.push(
          `${row.rowNumber}. sor: ${row.vezeteknev} ${row.keresztnev} — hasonló nevű személy már létezik (${dup.match.vezeteknev} ${dup.match.keresztnev}), de a születési év nem egyezik/ismeretlen, ezért új személyként importálva. Ellenőrizze, hogy nem duplikátum-e.`
        );
      }

      const addrKey = `${row.telepules}|||${row.utca}|||${row.hazszam}`;
      let householdId = householdCache.get(addrKey);
      if (!householdId) {
        const address = await prisma.address.upsert({
          where: {
            telepules_utca_hazszam_emeletAjto: {
              telepules: row.telepules,
              utca: row.utca,
              hazszam: row.hazszam,
              emeletAjto: "",
            },
          },
          create: { telepules: row.telepules, utca: row.utca, hazszam: row.hazszam },
          update: {},
        });
        let household = await prisma.household.findFirst({
          where: { addressId: address.id, gyulekezetId: upload.gyulekezetId },
        });
        if (!household) {
          household = await prisma.household.create({
            data: { addressId: address.id, gyulekezetId: upload.gyulekezetId },
          });
        }
        householdId = household.id;
        householdCache.set(addrKey, householdId);
      }

      const person = await prisma.person.create({
        data: {
          vezeteknev: row.vezeteknev,
          keresztnev: row.keresztnev,
          nem: row.nem,
          szuletesiDatum,
          szuletesiHely: row.szuletesiHely,
          vallas: row.vallas,
          megjegyzes: row.megjegyzes,
          gyulekezetId: upload.gyulekezetId,
        },
      });
      createdByName.set(normalizeName(row.vezeteknev, row.keresztnev), person.id);

      if (row.keresztelesDatuma) {
        await prisma.baptism.create({
          data: {
            personId: person.id,
            datuma: new Date(row.keresztelesDatuma),
            helye: row.keresztelesHelye,
            keresztszulok: row.keresztszulok,
          },
        });
      }
      if (row.konfirmacioDatuma) {
        await prisma.confirmation.create({
          data: {
            personId: person.id,
            datuma: new Date(row.konfirmacioDatuma),
            helye: row.konfirmacioHelye,
          },
        });
      }
      if (row.koltozottHonnan) {
        await prisma.movingRequest.create({
          data: {
            personId: person.id,
            regiCim: row.koltozottHonnan,
            ujCim: "Jelenlegi gyülekezet",
            celGyulekezetId: upload.gyulekezetId,
            status: "ELFOGADVA",
            elbiralva: new Date(),
          },
        });
      }
      if (row.hazastarsVezeteknev && row.hazastarsKeresztnev) {
        pendingSpouseLinks.push({
          personId: person.id,
          hazastarsVezeteknev: row.hazastarsVezeteknev,
          hazastarsKeresztnev: row.hazastarsKeresztnev,
          esketesDatuma: row.esketesDatuma,
          esketesHelye: row.esketesHelye,
          esketesLelkesze: row.esketesLelkesze,
          rowNumber: row.rowNumber,
        });
      }

      const existingMembers = await prisma.householdMember.findMany({
        where: { householdId },
        include: { person: true },
      });
      let szerep: "CSALADFO" | "HAZASTARS" | "GYERMEK" | "EGYEB" = "EGYEB";
      if (existingMembers.length === 0) {
        szerep = "CSALADFO";
      } else {
        const head = existingMembers.find((m) => m.szerep === "CSALADFO") ?? existingMembers[0];
        if (
          head.person.szuletesiDatum &&
          szuletesiDatum &&
          head.person.nem !== row.nem &&
          Math.abs(ageOn(szuletesiDatum, new Date()) - ageOn(head.person.szuletesiDatum, new Date())) <= 12 &&
          !existingMembers.some((m) => m.szerep === "HAZASTARS")
        ) {
          szerep = "HAZASTARS";
        } else if (head.person.szuletesiDatum && szuletesiDatum) {
          const gap = ageOn(head.person.szuletesiDatum, new Date()) - ageOn(szuletesiDatum, new Date());
          if (gap >= 15) szerep = "GYERMEK";
        }
      }

      await prisma.householdMember.create({ data: { householdId, personId: person.id, szerep } });
      created.push(`${row.vezeteknev} ${row.keresztnev}`);
    }

    // Házastárs-összekapcsolás második körben, miután minden sor személye létrejött
    for (const link of pendingSpouseLinks) {
      const targetName = normalizeName(link.hazastarsVezeteknev, link.hazastarsKeresztnev);
      let spouseId = createdByName.get(targetName);
      if (!spouseId) {
        const candidates = await prisma.person.findMany({
          where: { gyulekezetId: upload.gyulekezetId },
          select: { id: true, vezeteknev: true, keresztnev: true },
        });
        const match = candidates.find((c) => normalizeName(c.vezeteknev, c.keresztnev) === targetName);
        spouseId = match?.id;
      }
      if (!spouseId) {
        warnings.push(
          `${link.rowNumber}. sor: a megadott házastárs (${link.hazastarsVezeteknev} ${link.hazastarsKeresztnev}) nem található sem a táblázatban, sem a rendszerben — a házasság nem lett rögzítve, adja hozzá kézzel.`
        );
        continue;
      }
      const already = await prisma.marriage.findFirst({
        where: {
          OR: [
            { spouseAId: link.personId, spouseBId: spouseId },
            { spouseAId: spouseId, spouseBId: link.personId },
          ],
        },
      });
      if (already) continue;
      await prisma.marriage.create({
        data: {
          spouseAId: link.personId,
          spouseBId: spouseId,
          datuma: link.esketesDatuma ? new Date(link.esketesDatuma) : null,
          helye: link.esketesHelye,
          lelkeszNeve: link.esketesLelkesze,
        },
      });
    }

    return { letrehozva: created.length, kihagyottDuplikatum: skippedDuplicates.length, skippedDuplicates, warnings };
  });

  app.post("/api/import/cemetery", async (req, reply) => {
    const upload = await readUpload(req);
    if (!upload) return reply.code(400).send({ error: "Hiányzó fájl vagy gyülekezet" });

    const rows = await parseCemeteryWorkbook(upload.buffer);
    const updated: string[] = [];
    const created: string[] = [];
    const warnings: string[] = [];

    for (const row of rows) {
      const szuletesiDatum = row.szuletesiDatum ? new Date(row.szuletesiDatum) : null;
      const halalDatum = row.elhalalozasDatuma ?? row.temetesDatuma;
      const dup = await checkDuplicate(upload.gyulekezetId, row.vezeteknev, row.keresztnev, szuletesiDatum);

      if (dup.verdict === "EXACT" && dup.match) {
        const updatedPerson = await prisma.person.update({
          where: { id: dup.match.id },
          data: {
            elhunyt: true,
            elhunytDatuma: halalDatum ? new Date(halalDatum) : null,
            megjegyzes: row.megjegyzes ?? undefined,
          },
        });
        await applyWidowhoodCascade(dup.match.id, updatedPerson.elhunytDatuma);
        updated.push(`${row.vezeteknev} ${row.keresztnev} (meglévő rekord frissítve elhunytra)`);
        continue;
      }

      if (dup.verdict === "UNCERTAIN" && dup.match) {
        warnings.push(
          `${row.rowNumber}. sor: ${row.vezeteknev} ${row.keresztnev} — hasonló nevű személy már létezik (${dup.match.vezeteknev} ${dup.match.keresztnev}), de a születési év nem egyezik/ismeretlen, ezért új, önálló elhunyt rekordként importálva. Ellenőrizze, hogy nem ugyanarról a személyről van-e szó.`
        );
      }

      await prisma.person.create({
        data: {
          vezeteknev: row.vezeteknev,
          keresztnev: row.keresztnev,
          nem: row.nem,
          szuletesiDatum,
          gyulekezetId: upload.gyulekezetId,
          elhunyt: true,
          elhunytDatuma: halalDatum ? new Date(halalDatum) : null,
          megjegyzes: row.megjegyzes,
        },
      });
      created.push(`${row.vezeteknev} ${row.keresztnev}`);
    }

    return { letrehozva: created.length, frissitve: updated.length, updated, warnings };
  });
}
