import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";

const csaladiAllapotLabels: Record<string, string> = {
  NOTLEN_HAJADON: "Nőtlen / hajadon",
  HAZAS: "Házas",
  OZVEGY: "Özvegy",
  ELVALT: "Elvált",
};

const szerepLabels: Record<string, string> = {
  CSALADFO: "családfő",
  HAZASTARS: "házastárs",
  GYERMEK: "gyermek",
  EGYEB: "egyéb",
};

const tisztsegLabels: Record<string, string> = {
  PRESBITER: "Presbiter",
  POTPRESBITER: "Pótpresbiter",
  GONDNOK: "Gondnok",
  FOGONDNOK: "Főgondnok",
  NOSZOVETSEGI_TAG: "Nőszövetségi tag",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function addHeaderRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** Több érték egy cellába sűrítve, "; "-vel elválasztva - így egyetlen táblában is elfér
 * minden adat, anélkül hogy egy-egy több-értékű kapcsolat (pl. évenkénti befizetések) miatt
 * külön lapra vagy több sorra kéne bontani egy személyt. */
function joinList(items: string[]): string {
  return items.filter(Boolean).join("; ");
}

/**
 * Egy gyülekezet(ek) teljes, önmagában értelmezhető biztonsági másolata Excelben - egyetlen
 * táblában, soronként egy személlyel (nem több fülre szétszórva), hogy a fájl egyetlen
 * áttekintésben, szűréssel/rendezéssel is kezelhető maradjon. A több-értékű adatok (befizetések,
 * gyermekek stb.) egy-egy cellába sűrítve, felsorolásként szerepelnek.
 */
async function buildExportWorkbook(gyulekezetIds: string[] | "ALL"): Promise<ExcelJS.Workbook> {
  const gyulekezetWhere = gyulekezetIds === "ALL" ? {} : { gyulekezetId: { in: gyulekezetIds } };

  const persons = await prisma.person.findMany({
    where: gyulekezetWhere,
    orderBy: [{ vezeteknev: "asc" }, { keresztnev: "asc" }],
    include: {
      gyulekezet: { select: { nev: true } },
      householdMemberships: {
        include: { household: { include: { address: true } } },
      },
      baptism: true,
      confirmation: true,
      positions: { orderBy: [{ kezdete: "asc" }] },
      duesPayments: { orderBy: [{ ev: "asc" }] },
      donations: { orderBy: [{ ev: "asc" }] },
      marriagesA: { include: { spouseB: { select: { vezeteknev: true, keresztnev: true } } } },
      marriagesB: { include: { spouseA: { select: { vezeteknev: true, keresztnev: true } } } },
      parentLinks: { include: { parent: { select: { vezeteknev: true, keresztnev: true } } } },
      childLinks: { include: { child: { select: { vezeteknev: true, keresztnev: true } } } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gyülekezeti adatbázis";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Személyek");
  addHeaderRow(ws, [
    "Vezetéknév", "Keresztnév", "Nem", "Születési dátum", "Születési hely", "Vallás",
    "Családi állapot", "Elhunyt", "Elhalálozás dátuma", "Szerepkör a háztartásban", "Cím",
    "Gyülekezet", "Keresztelés dátuma", "Keresztelés helye", "Keresztszülők",
    "Konfirmáció dátuma", "Konfirmáció helye", "Házastárs(ak)", "Szülők", "Gyermekek",
    "Tisztségek", "Korábbi (nyitó) tartozás", "Egyházfenntartó befizetések", "Adományok",
    "Megjegyzés",
  ]);

  for (const p of persons) {
    const hm = p.householdMemberships[0];
    const cim = hm
      ? `${hm.household.address.telepules}, ${hm.household.address.utca} ${hm.household.address.hazszam}${hm.household.address.emeletAjto ? `, ${hm.household.address.emeletAjto}` : ""}`
      : "";

    const hazastarsak = joinList([
      ...p.marriagesA.map((m) => {
        const nev = m.spouseB ? `${m.spouseB.vezeteknev} ${m.spouseB.keresztnev}` : m.kulsoHazastarsNeve ?? "";
        return nev ? `${nev} (${fmtDate(m.datuma) || "dátum ismeretlen"}${m.vege ? `, lezárva: ${fmtDate(m.vege)}` : ""})` : "";
      }),
      ...p.marriagesB.map((m) => {
        const nev = m.spouseA ? `${m.spouseA.vezeteknev} ${m.spouseA.keresztnev}` : "";
        return nev ? `${nev} (${fmtDate(m.datuma) || "dátum ismeretlen"}${m.vege ? `, lezárva: ${fmtDate(m.vege)}` : ""})` : "";
      }),
    ]);

    const szulok = joinList(p.parentLinks.map((l) => `${l.parent.vezeteknev} ${l.parent.keresztnev}`));
    const gyermekek = joinList(p.childLinks.map((l) => `${l.child.vezeteknev} ${l.child.keresztnev}`));
    const tisztsegek = joinList(
      p.positions.map((pos) => `${tisztsegLabels[pos.tisztseg] ?? pos.tisztseg} (${fmtDate(pos.kezdete)}${pos.vege ? `–${fmtDate(pos.vege)}` : ""})`)
    );
    const befizetesek = joinList(p.duesPayments.map((d) => `${d.ev}: ${Number(d.osszeg)} lej`));
    const adomanyok = joinList(p.donations.map((d) => `${d.ev}: ${Number(d.osszeg)} lej${d.celja ? ` (${d.celja})` : ""}`));

    ws.addRow([
      p.vezeteknev, p.keresztnev, p.nem === "FERFI" ? "Férfi" : "Nő",
      fmtDate(p.szuletesiDatum), p.szuletesiHely ?? "", p.vallas ?? "",
      p.csaladiAllapot ? csaladiAllapotLabels[p.csaladiAllapot] : "",
      p.elhunyt ? "igen" : "", fmtDate(p.elhunytDatuma),
      hm ? szerepLabels[hm.szerep] ?? hm.szerep : "", cim, p.gyulekezet.nev,
      fmtDate(p.baptism?.datuma), p.baptism?.helye ?? "", p.baptism?.keresztszulok ?? "",
      fmtDate(p.confirmation?.datuma), p.confirmation?.helye ?? "",
      hazastarsak, szulok, gyermekek, tisztsegek,
      Number(p.nyitoTartozas) || "", befizetesek, adomanyok, p.megjegyzes ?? "",
    ]);
  }

  ws.columns.forEach((c) => (c.width = 20));
  ws.getColumn(19).width = 30; // Szülők
  ws.getColumn(20).width = 30; // Gyermekek
  ws.getColumn(23).width = 40; // Egyházfenntartó befizetések
  ws.getColumn(24).width = 40; // Adományok

  return workbook;
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Bármely bejelentkezett felhasználó letöltheti a saját (vagy adminként/esperesként/
  // püspökként elérhető) gyülekezet(ek) teljes adatát biztonsági másolatként - ugyanaz a
  // láthatósági kör, mint minden más listázó végponté ebben a rendszerben.
  app.get("/api/export/szemelyek", async (req, reply) => {
    const accessible = await getAccessibleGyulekezetIds(req.currentUser!);
    if (accessible !== "ALL" && accessible.length === 0) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }
    const workbook = await buildExportWorkbook(accessible);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `gyulekezeti_adatok_${new Date().toISOString().slice(0, 10)}.xlsx`;
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer);
  });
}
