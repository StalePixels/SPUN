import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: Buffer;
  // A second name in an Info-ZIP Unicode Path extra field (0x7075) of the central directory.
  unicodeName?: string;
  // The uncompressed size the directory states. The entry is then marked deflated, though its data stays stored.
  usize?: number;
};

function unicodePath(name: Buffer, unicodeName: string): Buffer {
  const utf8 = Buffer.from(unicodeName, "utf8");
  const field = Buffer.alloc(9);
  field.writeUInt16LE(0x7075, 0);
  field.writeUInt16LE(5 + utf8.length, 2);
  field.writeUInt8(1, 4);
  field.writeUInt32LE(crc32(name), 5);
  return Buffer.concat([field, utf8]);
}

// Builds zip files (stored, no compression) for upload tests.
export function makeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.usize ?? entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    if (entry.usize !== undefined) {
      local.writeUInt16LE(8, 8);
      central.writeUInt16LE(8, 10);
    }
    const extra = entry.unicodeName === undefined ? Buffer.alloc(0) : unicodePath(name, entry.unicodeName);
    central.writeUInt16LE(extra.length, 30);
    locals.push(local, name, entry.data);
    centrals.push(central, name, extra);
    offset += local.length + name.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// A temporary directory for the files of one test. Call remove() when done.
export function tempFiles() {
  const dir = mkdtempSync(path.join(tmpdir(), "spun-e2e-"));
  return {
    write(name: string, data: Buffer): string {
      const file = path.join(dir, name);
      writeFileSync(file, data);
      return file;
    },
    remove() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const sampleEntries = () => [
  { name: "README.TXT", data: Buffer.from("SPUN end-to-end test\r\n") },
  { name: "GAME/MAIN.BAS", data: randomBytes(512) },
];
