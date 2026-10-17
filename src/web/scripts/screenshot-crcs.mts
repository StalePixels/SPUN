// Adds screenshots.thumb_crc and screenshots.nxi_crc if they are missing, then
// sets both to the CRC32 of the screenshot's files. The files of a live app are
// in STORAGE_DIR/public, those of a deleted app in STORAGE_DIR/bin. A file that
// is not there gets 0 (unknown), so the client does not cache it. Each run sets
// the values from the files again, so a second run changes nothing.
// DATABASE_URL and STORAGE_DIR come from the environment, else from .env here.
//   node scripts/screenshot-crcs.mts

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

const envFile = path.join(import.meta.dirname, "..", ".env");
if ((!process.env.DATABASE_URL || !process.env.STORAGE_DIR) && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const databaseUrl = process.env.DATABASE_URL;
const storageDir = process.env.STORAGE_DIR;
if (!databaseUrl || !storageDir) {
  console.error("Set DATABASE_URL and STORAGE_DIR, in the environment or in src/web/.env.");
  process.exit(1);
}
if (!existsSync(path.join(storageDir, "public"))) {
  console.error(`No public directory in STORAGE_DIR (${storageDir}).`);
  process.exit(1);
}

type Kind = "thumb" | "nxi";

function filePath(kind: Kind, username: string, appId: string, slot: number, deleted: boolean): string {
  return deleted
    ? path.join(storageDir!, "bin", `${appId}-${kind}-${slot}`)
    : path.join(storageDir!, "public", username, kind, appId, String(slot));
}

function fileCrc(file: string): number | null {
  return existsSync(file) ? crc32(readFileSync(file)) : null;
}

const connection = await mysql.createConnection({ uri: databaseUrl });
try {
  await connection.query(
    "ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS thumb_crc INT UNSIGNED NOT NULL DEFAULT 0 AFTER width",
  );
  await connection.query(
    "ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS nxi_crc INT UNSIGNED NOT NULL DEFAULT 0 AFTER thumb_crc",
  );

  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT s.app_id, s.slot, s.thumb_crc, s.nxi_crc, s.updated_at, a.deleted_at, u.username
     FROM screenshots s
     JOIN apps a ON a.id = s.app_id
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY s.app_id, s.slot`,
  );

  let changed = 0;
  let missing = 0;
  for (const row of rows) {
    const appId = row.app_id as string;
    const slot = row.slot as number;
    const deleted = row.deleted_at !== null;
    const crcs = { thumb: 0, nxi: 0 };
    for (const kind of ["thumb", "nxi"] as const) {
      const file = row.username ? filePath(kind, row.username, appId, slot, deleted) : null;
      const crc = file ? fileCrc(file) : null;
      if (crc === null) {
        missing++;
        console.log(`missing: app ${appId} slot ${slot} ${kind}: ${file ?? "the owner has no username"}; set to 0`);
      }
      crcs[kind] = crc ?? 0;
    }
    if (crcs.thumb === row.thumb_crc && crcs.nxi === row.nxi_crc) {
      continue;
    }
    // A screenshot replaced while this runs has a new updated_at, and keeps the CRCs the CMS wrote.
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE screenshots SET thumb_crc = ?, nxi_crc = ?, updated_at = updated_at
       WHERE app_id = ? AND slot = ? AND updated_at = ?`,
      [crcs.thumb, crcs.nxi, appId, slot, row.updated_at],
    );
    if (result.affectedRows === 1) {
      changed++;
    } else {
      console.log(`skipped: app ${appId} slot ${slot} changed during the run`);
    }
  }
  console.log(`${rows.length} screenshot rows, ${changed} changed, ${missing} files missing.`);
} finally {
  await connection.end();
}
