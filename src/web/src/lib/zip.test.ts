import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "./rules";
import { checkZip } from "./zip";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A minimal zip with stored (uncompressed) entries.
function makeZip(files: Record<string, Buffer>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += header.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const count = Object.keys(files).length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

describe("zip check", () => {
  const valid = makeZip({
    "README.TXT": Buffer.from("hello"),
    "GAME/GAME.NEX": Buffer.alloc(1000, 7),
  });

  it("passes a valid zip and lists its entries", async () => {
    expect(await checkZip(valid)).toEqual({
      ok: true,
      entries: ["README.TXT", "GAME/GAME.NEX"],
    });
  });

  it("rejects a cut zip", async () => {
    const cut = valid.subarray(0, valid.length - 30);
    expect(await checkZip(cut)).toEqual({ ok: false, error: { code: "file.notZip" } });
  });

  it("rejects a file that is not a zip", async () => {
    expect(await checkZip(Buffer.from("This is not a zip file.\n".repeat(10)))).toEqual({
      ok: false,
      error: { code: "file.notZip" },
    });
  });

  it("accepts a zip of exactly 4 MB", async () => {
    const overhead = makeZip({ "BIG.BIN": Buffer.alloc(0) }).length;
    const zip = makeZip({ "BIG.BIN": Buffer.alloc(MAX_UPLOAD_BYTES - overhead) });
    expect(zip.length).toBe(MAX_UPLOAD_BYTES);
    expect((await checkZip(zip)).ok).toBe(true);
  });

  it("rejects a file over 4 MB", async () => {
    const zip = makeZip({ "BIG.BIN": Buffer.alloc(MAX_UPLOAD_BYTES) });
    expect(zip.length).toBeGreaterThan(MAX_UPLOAD_BYTES);
    const result = await checkZip(zip);
    expect(result).toEqual({ ok: false, error: { code: "file.tooLarge" } });
  });
});
