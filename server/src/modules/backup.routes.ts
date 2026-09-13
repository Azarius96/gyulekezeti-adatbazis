import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { isAdmin } from "../auth/scope.js";
import { createBackup, deleteBackup, getBackupFilePath, listBackups, restoreBackup, saveUploadedBackup } from "./backup.js";
import { exportGyulekezetData, parseGyulekezetSnapshot, restoreGyulekezetData } from "./gyulekezetBackup.js";

// Az adatbázis biztonsági mentések kezelése (listázás, kézi mentés, letöltés, törlés,
// visszaállítás) kizárólag rendszergazda számára elérhető - teljes adatbázis-visszaállítást
// senki más nem indíthat.
export async function backupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply, done) => {
    if (!req.currentUser || !isAdmin(req.currentUser)) {
      reply.code(403).send({ error: "Csak rendszergazda érheti el" });
      return;
    }
    done();
  });

  app.get("/api/backups", async () => {
    return listBackups();
  });

  app.post("/api/backups", async (_req, reply) => {
    try {
      return await createBackup("manual");
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Nem sikerült mentést készíteni" });
    }
  });

  // Saját gépről feltöltött .dump fájl elmentése a mentések közé - ezután a normál lista/letöltés/
  // visszaállítás/törlés útvonalakon keresztül kezelhető, mintha a szerver készítette volna.
  app.post("/api/backups/upload", async (req, reply) => {
    let buffer: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        buffer = await part.toBuffer();
      }
    }
    if (!buffer) return reply.code(400).send({ error: "Nem érkezett fájl" });
    try {
      const meta = await saveUploadedBackup(buffer);
      return meta;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a mentést" });
    }
  });

  app.get("/api/backups/:filename/download", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    let filePath: string;
    try {
      filePath = getBackupFilePath(filename);
    } catch {
      return reply.code(400).send({ error: "Érvénytelen fájlnév" });
    }
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(createReadStream(filePath));
  });

  app.delete("/api/backups/:filename", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    try {
      await deleteBackup(filename);
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: "Érvénytelen fájlnév" });
    }
  });

  app.post("/api/backups/:filename/restore", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    try {
      const result = await restoreBackup(filename);
      return { ok: true, preRestoreBackup: result.preRestoreBackup };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "A visszaállítás sikertelen" });
    }
  });

  // ---------- Gyülekezetenkénti (részleges) mentés ----------

  app.get("/api/backups/gyulekezet/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const snapshot = await exportGyulekezetData(id);
      const filename = `${snapshot.gyulekezetNev.replace(/[^a-zA-Z0-9_-]+/g, "_")}_${snapshot.exportedAt.slice(0, 10)}.json`;
      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return snapshot;
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "Nem sikerült exportálni" });
    }
  });

  app.post("/api/backups/gyulekezet/:id/restore", async (req, reply) => {
    const { id } = req.params as { id: string };
    let buffer: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        buffer = await part.toBuffer();
      }
    }
    if (!buffer) return reply.code(400).send({ error: "Nem érkezett fájl" });
    try {
      const snapshot = parseGyulekezetSnapshot(buffer);
      const result = await restoreGyulekezetData(id, snapshot);
      return { ok: true, preRestoreBackup: result.preRestoreBackup };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "A visszaállítás sikertelen" });
    }
  });
}
