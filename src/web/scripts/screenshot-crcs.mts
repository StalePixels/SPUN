// Prints the SQL that sets screenshots.thumb_crc and screenshots.nxi_crc to the
// CRC32 of each screenshot's files. It reads only STORAGE_DIR, and needs no
// packages, so it also runs in the production CMS image. The files of a live
// app are in public/<username>/{thumb,nxi}/<appid>/<slot>, those of a deleted
// app in bin/<appid>-{thumb,nxi}-<slot>. A row with no file keeps 0 (unknown),
// so the client does not cache it. The SQL is the same on every run while the
// files are the same.
//   STORAGE_DIR=/path/to/storage node scripts/screenshot-crcs.mts > crcs.sql
//   docker compose exec -T cms node --input-type=module-typescript - < ../src/web/scripts/screenshot-crcs.mts > crcs.sql

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";

const storageDir = process.env.STORAGE_DIR;
if (!storageDir || !existsSync(path.join(storageDir, "public"))) {
  console.error(`Set STORAGE_DIR to a storage directory with a public directory in it (now: ${storageDir ?? "unset"}).`);
  process.exit(1);
}

type Kind = "thumb" | "nxi";
const KINDS: Kind[] = ["thumb", "nxi"];
const APP_ID = /^[0-9a-z]{6}$/;
const SLOT = /^[1-9][0-9]*$/;

// key: "<appid> <slot>"; later files win, so the live files go in after the bin.
const crcs = new Map<string, Partial<Record<Kind, number>>>();

function add(appId: string, slot: string, kind: Kind, file: string): void {
  if (!APP_ID.test(appId) || !SLOT.test(slot)) {
    console.error(`skipped: ${file} is not a screenshot file name`);
    return;
  }
  const key = `${appId} ${slot}`;
  crcs.set(key, { ...crcs.get(key), [kind]: crc32(readFileSync(file)) });
}

function dirs(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
}

const binDir = path.join(storageDir, "bin");
if (existsSync(binDir)) {
  for (const name of readdirSync(binDir)) {
    const match = /^(.+)-(thumb|nxi)-(.+)$/.exec(name);
    if (match) {
      add(match[1], match[3], match[2] as Kind, path.join(binDir, name));
    }
  }
}

const publicDir = path.join(storageDir, "public");
for (const username of dirs(publicDir)) {
  for (const kind of KINDS) {
    const kindDir = path.join(publicDir, username, kind);
    for (const appId of dirs(kindDir)) {
      for (const slot of readdirSync(path.join(kindDir, appId))) {
        add(appId, slot, kind, path.join(kindDir, appId, slot));
      }
    }
  }
}

console.log("-- SPUN screenshot CRC32s, from the files in STORAGE_DIR.");
for (const [key, values] of crcs) {
  const [appId, slot] = key.split(" ");
  const sets = KINDS.filter((kind) => values[kind] !== undefined).map((kind) => `${kind}_crc = ${values[kind]}`);
  console.log(`UPDATE screenshots SET ${sets.join(", ")}, updated_at = updated_at WHERE app_id = '${appId}' AND slot = ${slot};`);
}
console.error(`${crcs.size} screenshots.`);
