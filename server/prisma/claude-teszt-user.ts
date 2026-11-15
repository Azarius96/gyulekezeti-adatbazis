import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { withRequestContext, setCurrentActor } from "../src/lib/requestContext.js";

const EMAIL = "teszt@example.com";
withRequestContext(() => {
  setCurrentActor({ userId: null, userNev: "Claude" });
  (async () => {
    if (await prisma.user.findUnique({ where: { email: EMAIL } })) throw new Error("Már létezik");
    const ehk = await prisma.egyhazmegye.findMany();
    const pw = crypto.randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: {
        email: EMAIL,
        nev: "Teszt felhasználó (csak olvasó)",
        passwordHash: await bcrypt.hash(pw, 12),
        roles: { create: ehk.map((e) => ({ szerepKor: "ESPERES" as const, egyhazmegyeId: e.id })) },
        capabilities: { create: { kod: "CSAK_OLVASO" } },
      },
    });
    console.log(`LÉTREHOZVA: ${EMAIL} / ${pw} (${ehk.length} egyházmegye)`);
  })().catch((e) => { console.error(e); process.exitCode = 1; });
});
