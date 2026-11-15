/**
 * Egyszeri adatjavítás (2026. november): biztos szülő-gyermek kapcsolatok felvétele (ifj./id. névazonosság, azonos háztartás).
 * Csak HOZZÁAD, meglévő kapcsolatot nem módosít/töröl. DRY_RUN=1: csak kiír. A "Claude" névvel naplózódik.
 */
import fs from "node:fs";
import { prisma } from "../src/lib/prisma.js";
import { withRequestContext, setCurrentActor } from "../src/lib/requestContext.js";

const DRY = process.env.DRY_RUN === "1";
const lista = JSON.parse(fs.readFileSync(process.env.LISTA ?? "/tmp/tier1.json", "utf-8")) as { parentId: string; childId: string; szulo: string; gyerek: string }[];

withRequestContext(() => {
  setCurrentActor({ userId: null, userNev: "Claude" });
  (async () => {
    console.log(DRY ? "PRÓBAFUTÁS" : "ÉLES FUTÁS", lista.length, "kapcsolat");
    let letrehozva = 0;
    for (const k of lista) {
      const [p, c] = await Promise.all([
        prisma.person.findUnique({ where: { id: k.parentId } }),
        prisma.person.findUnique({ where: { id: k.childId } }),
      ]);
      const nev = (x: { vezeteknev: string; keresztnev: string } | null) => (x ? `${x.vezeteknev} ${x.keresztnev}` : "?");
      if (!p || !c || nev(p) !== k.szulo || nev(c) !== k.gyerek) {
        console.log("  KIHAGYVA (a személy nem az, amit vártunk):", k.szulo, "->", k.gyerek);
        continue;
      }
      const van = await prisma.familyLink.findFirst({ where: { parentId: k.parentId, childId: k.childId } });
      if (van) {
        console.log("  MÁR LÉTEZIK:", k.szulo, "->", k.gyerek);
        continue;
      }
      console.log("  kapcsolat:", k.szulo, "(szülő) ->", k.gyerek, "(gyerek)");
      if (!DRY) await prisma.familyLink.create({ data: { parentId: k.parentId, childId: k.childId } });
      letrehozva++;
    }
    console.log("Létrehozva:", letrehozva, "| FamilyLink összesen:", await prisma.familyLink.count());
  })().catch((e) => { console.error(e); process.exitCode = 1; });
});
