import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ADATBÁZIS BIZTONSÁGI MENTÉS
 * ============================
 * Kétféle módban tud pg_dump/pg_restore-t futtatni, a `BACKUP_STRATEGY` környezeti változó
 * szerint:
 *
 * - "docker" (alapértelmezett, helyi fejlesztéshez): a Postgres Docker-konténerben fut, a Node
 *   szerver a hoszton (ahol nincs telepítve pg_dump/pg_restore) - ezért `docker exec`-en
 *   keresztül hívja a konténeren belüli binárisokat.
 * - "direct" (éles, konténerizált telepítéshez, pl. Coolify): a Node szerver maga is egy
 *   konténerben fut, ugyanazon a Docker-hálózaton, mint a Postgres - ilyenkor a pg_dump/
 *   pg_restore binárisokat KÖZVETLENÜL, hálózaton keresztül hívjuk a DATABASE_URL-lel, docker
 *   exec/socket-hozzáférés nélkül (ehhez a szerver image-nek tartalmaznia kell a
 *   postgresql-client csomagot).
 *
 * A mentési fájlokat mindkét módban a szerver saját (server/backups/) mappájában tároljuk, hogy
 * a szerver folyamat közvetlenül kezelhesse (listázás, letöltés, törlés, retenció).
 *
 * Retenció ("Time Machine"-szerű, hogy sose teljen túl a tárhely): az utolsó 30 napból minden
 * (heti ütemezésnél kb. 4-5 db) megmarad, 30-180 nap között hetente egy, 180 napon túl havonta
 * egy - a többi automatikusan törlődik minden új mentés után. A kézi és a visszaállítás előtti
 * biztonsági mentések ettől függetlenül, saját típusonként az utolsó 10 darabot tartják meg,
 * hogy a korosztályos szabály véletlenül se törölhesse el egy friss, szándékos mentést.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(__dirname, "..", "..", "backups");

const BACKUP_STRATEGY = process.env.BACKUP_STRATEGY === "direct" ? "direct" : "docker";
const DB_CONTAINER = process.env.DB_DOCKER_CONTAINER ?? "gyulekezetiadatbazis-db-1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type BackupReason = "scheduled" | "manual" | "pre-restore" | "uploaded";

export interface BackupMeta {
  filename: string;
  reason: BackupReason;
  createdAt: string;
  sizeBytes: number;
}

function dbConfigFromUrl(): { user: string; password: string; database: string } {
  const url = new URL(process.env.DATABASE_URL!);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

const FILENAME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})__(scheduled|manual|pre-restore|uploaded)\.dump$/;

function parseFilename(filename: string): { createdAt: string; reason: BackupReason } | null {
  const m = filename.match(FILENAME_RE);
  if (!m) return null;
  const iso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3") + "Z";
  return { createdAt: iso, reason: m[2] as BackupReason };
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

/** A `backups/` mappán belüli, adott fájlnévhez tartozó teljes útvonal - eldobja a kérést,
 * ha a fájlnév nem a várt mintát követi (könyvtár-bejárás elleni védelem). */
export function getBackupFilePath(filename: string): string {
  if (!FILENAME_RE.test(filename)) {
    throw new Error("Érvénytelen fájlnév");
  }
  return path.join(BACKUP_DIR, filename);
}

export async function listBackups(): Promise<BackupMeta[]> {
  await ensureBackupDir();
  const files = await fs.readdir(BACKUP_DIR);
  const metas: BackupMeta[] = [];
  for (const filename of files) {
    const parsed = parseFilename(filename);
    if (!parsed) continue;
    const stat = await fs.stat(path.join(BACKUP_DIR, filename));
    metas.push({ filename, reason: parsed.reason, createdAt: parsed.createdAt, sizeBytes: stat.size });
  }
  metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return metas;
}

function runCmd(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} kilépési kód ${code}: ${stderr.slice(0, 4000)}`));
    });
  });
}

function runToFile(cmd: string, args: string[], filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const fileStream = createWriteStream(filePath);
    let stderr = "";
    let childExited = false;
    let streamFinished = false;
    let exitCode: number | null = null;

    function maybeResolve() {
      if (!childExited || !streamFinished) return;
      if (exitCode === 0) resolve();
      else reject(new Error(`pg_dump kilépési kód ${exitCode}: ${stderr.slice(0, 4000)}`));
    }

    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.stdout?.pipe(fileStream);
    child.on("error", reject);
    fileStream.on("error", reject);
    child.on("close", (code) => {
      childExited = true;
      exitCode = code;
      maybeResolve();
    });
    fileStream.on("finish", () => {
      streamFinished = true;
      maybeResolve();
    });
  });
}

function timestampForFilename(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/:/g, "-");
}

export async function createBackup(reason: BackupReason): Promise<BackupMeta> {
  await ensureBackupDir();
  const now = new Date();
  const filename = `${timestampForFilename(now)}__${reason}.dump`;
  const filePath = path.join(BACKUP_DIR, filename);

  try {
    if (BACKUP_STRATEGY === "direct") {
      await runToFile("pg_dump", [process.env.DATABASE_URL!, "-Fc"], filePath);
    } else {
      const { user, password, database } = dbConfigFromUrl();
      await runToFile(
        "docker",
        ["exec", "-e", `PGPASSWORD=${password}`, DB_CONTAINER, "pg_dump", "-U", user, "-d", database, "-Fc"],
        filePath
      );
    }
  } catch (err) {
    await fs.rm(filePath, { force: true });
    throw err;
  }

  const stat = await fs.stat(filePath);
  await pruneOldBackups();
  return { filename, reason, createdAt: now.toISOString(), sizeBytes: stat.size };
}

// A pg_dump egyéni ("-Fc") formátumú fájljai mindig ezzel a 5 bájtos jelzéssel kezdődnek - ez a
// minimális, olcsó ellenőrzés, hogy a feltöltött fájl valóban egy Postgres-mentés lehet, mielőtt
// egyáltalán elmentenénk (nem helyettesíti a tényleges visszaállításkor a pg_restore saját,
// szigorúbb validációját, de kiszűri a nyilvánvalóan rossz fájlokat idejekorán).
const PG_DUMP_MAGIC = Buffer.from("PGDMP");

/** Feltöltött .dump fájl elmentése a mentések közé - ezután a fájl egy teljesen normál
 * biztonsági mentésként listázódik, tölthető le, állítható vissza vagy törölhető. */
export async function saveUploadedBackup(buffer: Buffer): Promise<BackupMeta> {
  if (buffer.length < PG_DUMP_MAGIC.length || !buffer.subarray(0, PG_DUMP_MAGIC.length).equals(PG_DUMP_MAGIC)) {
    throw new Error("A feltöltött fájl nem tűnik érvényes Postgres biztonsági mentésnek");
  }
  await ensureBackupDir();
  const now = new Date();
  const filename = `${timestampForFilename(now)}__uploaded.dump`;
  const filePath = path.join(BACKUP_DIR, filename);
  await fs.writeFile(filePath, buffer);
  const stat = await fs.stat(filePath);
  await pruneOldBackups();
  return { filename, reason: "uploaded", createdAt: now.toISOString(), sizeBytes: stat.size };
}

export async function deleteBackup(filename: string): Promise<void> {
  const filePath = getBackupFilePath(filename);
  await fs.rm(filePath, { force: true });
}

function weekBucketKey(isoDate: string): string {
  return String(Math.floor(new Date(isoDate).getTime() / DAY_MS / 7));
}

/** Time Machine-szerű, korosztályos retenció - ld. a fájl tetején lévő magyarázatot. */
export async function pruneOldBackups(): Promise<void> {
  const backups = await listBackups();
  const now = Date.now();
  const keep = new Set<string>();

  const seenWeekBuckets = new Set<string>();
  const seenMonthBuckets = new Set<string>();
  for (const b of backups.filter((b) => b.reason === "scheduled")) {
    const ageMs = now - new Date(b.createdAt).getTime();
    if (ageMs < 30 * DAY_MS) {
      keep.add(b.filename);
    } else if (ageMs < 180 * DAY_MS) {
      const bucket = weekBucketKey(b.createdAt);
      if (!seenWeekBuckets.has(bucket)) {
        seenWeekBuckets.add(bucket);
        keep.add(b.filename);
      }
    } else {
      const bucket = b.createdAt.slice(0, 7);
      if (!seenMonthBuckets.has(bucket)) {
        seenMonthBuckets.add(bucket);
        keep.add(b.filename);
      }
    }
  }

  for (const reason of ["manual", "pre-restore", "uploaded"] as const) {
    for (const b of backups.filter((b) => b.reason === reason).slice(0, 10)) {
      keep.add(b.filename);
    }
  }

  for (const b of backups) {
    if (!keep.has(b.filename)) {
      await fs.rm(path.join(BACKUP_DIR, b.filename), { force: true });
    }
  }
}

/**
 * Visszaállítja az adatbázist a megadott mentésből. Előtte mindig készít egy friss
 * "pre-restore" mentést az aktuális állapotról - így a visszaállítás maga is visszavonható,
 * ha tévedésből a rossz mentést választották (ez a "Time Machine"-jelleg lényege).
 */
export async function restoreBackup(filename: string): Promise<{ preRestoreBackup: BackupMeta }> {
  const filePath = getBackupFilePath(filename);
  await fs.access(filePath);

  const preRestoreBackup = await createBackup("pre-restore");

  if (BACKUP_STRATEGY === "direct") {
    await runCmd("pg_restore", ["--clean", "--if-exists", "-d", process.env.DATABASE_URL!, filePath]);
    return { preRestoreBackup };
  }

  const { user, password, database } = dbConfigFromUrl();
  const containerTmpPath = `/tmp/restore_${Date.now()}.dump`;
  await runCmd("docker", ["cp", filePath, `${DB_CONTAINER}:${containerTmpPath}`]);
  try {
    await runCmd("docker", [
      "exec",
      "-e",
      `PGPASSWORD=${password}`,
      DB_CONTAINER,
      "pg_restore",
      "--clean",
      "--if-exists",
      "-U",
      user,
      "-d",
      database,
      containerTmpPath,
    ]);
  } finally {
    await runCmd("docker", ["exec", DB_CONTAINER, "rm", "-f", containerTmpPath]).catch(() => {});
  }

  return { preRestoreBackup };
}

/** Induláskor egyszer, utána naponta ellenőrzi, hogy esedékes-e egy heti mentés - ha a
 * szerver egy hétvégén át le volt állítva, a legközelebbi induláskor pótolja, sosem hagyja ki. */
export function scheduleWeeklyBackups(): void {
  const CHECK_INTERVAL_MS = DAY_MS;

  async function tick() {
    try {
      const backups = await listBackups();
      const lastScheduled = backups.find((b) => b.reason === "scheduled");
      const due = !lastScheduled || Date.now() - new Date(lastScheduled.createdAt).getTime() >= 7 * DAY_MS;
      if (due) {
        const backup = await createBackup("scheduled");
        console.log(`Automatikus heti biztonsági mentés kész: ${backup.filename}`);
      }
    } catch (err) {
      console.error("Automatikus biztonsági mentés sikertelen:", err);
    }
  }

  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
