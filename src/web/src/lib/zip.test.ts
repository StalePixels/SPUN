import { describe, expect, it } from "vitest";
import { MAX_UNPACKED_BYTES, MAX_UPLOAD_BYTES } from "./rules";
import { checkZip, NEXT_NAME_MAX } from "./zip";

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

type ZipOptions = {
  method?: number;
  flags?: number;
  // Central directory sizes of 0xffffffff, with the real sizes in a zip64 extra field
  zip64Sizes?: boolean;
  disk?: number;
  diskEntries?: number;
  // End record counts and offset of 0xffff and 0xffffffff, with zip64 end records
  zip64End?: boolean;
  localSig?: number;
  // The uncompressed size written to the central directory, instead of the real one
  usize?: number;
  // An Info-ZIP Unicode Path extra field (0x7075) in the central directory, by raw name
  unicodeNames?: Record<string, string>;
};

function unicodePath(rawName: Buffer, name: string): Buffer {
  const utf8 = Buffer.from(name, "utf8");
  const field = Buffer.alloc(9);
  field.writeUInt16LE(0x7075, 0);
  field.writeUInt16LE(5 + utf8.length, 2);
  field.writeUInt8(1, 4);
  field.writeUInt32LE(crc32(rawName), 5);
  return Buffer.concat([field, utf8]);
}

// A minimal zip with stored (uncompressed) entries. The method field can be
// set to any value; the data stays stored, as only the directory is read.
function makeZip(files: Record<string, Buffer>, options: ZipOptions = {}): Buffer {
  const { method = 0, flags = 0 } = options;
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "latin1");
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(options.localSig ?? 0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, data);

    const zip64 = Buffer.alloc(options.zip64Sizes ? 20 : 0);
    if (options.zip64Sizes) {
      zip64.writeUInt16LE(0x0001, 0);
      zip64.writeUInt16LE(16, 2);
      zip64.writeBigUInt64LE(BigInt(data.length), 4);
      zip64.writeBigUInt64LE(BigInt(data.length), 12);
    }
    const unicode = options.unicodeNames?.[name];
    const extra = unicode === undefined ? zip64 : Buffer.concat([zip64, unicodePath(nameBuf, unicode)]);
    const size = options.zip64Sizes ? 0xffffffff : data.length;
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(45, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(flags, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(size, 20);
    entry.writeUInt32LE(options.usize ?? size, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(extra.length, 30);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf, extra);
    offset += header.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const count = Object.keys(files).length;
  const zip64: Buffer[] = [];
  if (options.zip64End) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(BigInt(44), 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(centralBuf.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + centralBuf.length), 8);
    locator.writeUInt32LE(1, 16);
    zip64.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.disk ?? 0, 4);
  end.writeUInt16LE(options.zip64End ? 0xffff : (options.diskEntries ?? count), 8);
  end.writeUInt16LE(options.zip64End ? 0xffff : count, 10);
  end.writeUInt32LE(options.zip64End ? 0xffffffff : centralBuf.length, 12);
  end.writeUInt32LE(options.zip64End ? 0xffffffff : offset, 16);
  return Buffer.concat([...local, centralBuf, ...zip64, end]);
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

  it("accepts deflate entries", async () => {
    expect((await checkZip(makeZip({ "A.TXT": Buffer.from("a") }, { method: 8 }))).ok).toBe(true);
  });

  it("rejects a compression method other than store or deflate", async () => {
    for (const method of [1, 6, 12, 14]) {
      expect(await checkZip(makeZip({ "A.TXT": Buffer.from("a") }, { method }))).toEqual({
        ok: false,
        error: { code: "file.incompatible" },
      });
    }
  });

  const incompatible = { ok: false, error: { code: "file.incompatible" } };
  const a = { "A.TXT": Buffer.from("a") };

  it("rejects an absolute path, a drive letter and ..", async () => {
    for (const name of ["/GAME.NEX", "\\GAME.NEX", "C:/GAME.NEX", "c:GAME.NEX", "../GAME.NEX", "GAME/../../X", "GAME\\..\\..\\X"]) {
      expect(await checkZip(makeZip({ [name]: Buffer.from("a") }))).toEqual(incompatible);
    }
  });

  it("rejects a colon anywhere in a name", async () => {
    expect(await checkZip(makeZip({ "GAME/A:B.TXT": Buffer.from("a") }))).toEqual(incompatible);
  });

  it("rejects an encrypted entry", async () => {
    expect(await checkZip(makeZip(a, { method: 8, flags: 1 }))).toEqual(incompatible);
    expect(await checkZip(makeZip(a, { method: 8, flags: 0x41 }))).toEqual(incompatible);
  });

  it("rejects zip64 entry sizes", async () => {
    expect(await checkZip(makeZip(a, { zip64Sizes: true }))).toEqual(incompatible);
  });

  it("rejects a zip64 end record", async () => {
    expect(await checkZip(makeZip(a, { zip64End: true }))).toEqual(incompatible);
  });

  it("rejects a multi-disk zip", async () => {
    expect(await checkZip(makeZip(a, { disk: 1 }))).toEqual(incompatible);
    expect(await checkZip(makeZip(a, { diskEntries: 0 }))).toEqual(incompatible);
  });

  it("rejects an empty name and a name too long for any install directory", async () => {
    expect(await checkZip(makeZip({ "": Buffer.from("a") }))).toEqual(incompatible);
    expect(await checkZip(makeZip({ ["A".repeat(NEXT_NAME_MAX + 1)]: Buffer.from("a") }))).toEqual(
      incompatible,
    );
    expect((await checkZip(makeZip({ ["A".repeat(NEXT_NAME_MAX)]: Buffer.from("a") }))).ok).toBe(true);
  });

  it("refuses names outside printable ASCII or with characters FAT does not allow, and names each one", async () => {
    for (const bad of ['"', "*", "<", ">", "?", "|", "\x00", "\x1f", "\x7f", "\xe9"]) {
      expect(await checkZip(makeZip({ "OK.TXT": Buffer.from("a"), [`GAME/A${bad}B.TXT`]: Buffer.from("a") }))).toEqual({
        ok: false,
        error: { code: "file.badNames", names: [`GAME/A${bad}B.TXT`] },
      });
    }
    expect(
      await checkZip(makeZip({ "C\xe9.TXT": Buffer.from("a"), "OK.TXT": Buffer.from("b"), "D?.TXT": Buffer.from("c") })),
    ).toEqual({ ok: false, error: { code: "file.badNames", names: ["C\xe9.TXT", "D?.TXT"] } });
  });

  it("reads a UTF-8 name as UTF-8 in the list of bad names", async () => {
    const name = Buffer.from("CAFÉ.TXT", "utf8").toString("latin1");
    expect(await checkZip(makeZip({ [name]: Buffer.from("a") }))).toEqual({
      ok: false,
      error: { code: "file.badNames", names: ["CAFÉ.TXT"] },
    });
  });

  it("accepts every other printable ASCII character in a name", async () => {
    expect((await checkZip(makeZip({ "README.TXT": Buffer.from("a"), "GAME/A b!#$%&'()+,-.;=@[\\]^_`{}.TXT": Buffer.from("a") }))).ok).toBe(true);
  });

  it("rejects a damaged local header as not a zip", async () => {
    expect(await checkZip(makeZip(a, { localSig: 0 }))).toEqual({
      ok: false,
      error: { code: "file.notZip" },
    });
  });

  it("accepts data descriptors and directory entries", async () => {
    expect((await checkZip(makeZip(a, { flags: 8 }))).ok).toBe(true);
    expect((await checkZip(makeZip({ "GAME/": Buffer.alloc(0), "GAME/A.TXT": Buffer.from("a"), "README.TXT": Buffer.from("b") }))).ok).toBe(true);
  });

  it("takes each name from the central directory as the Next does, never from a Unicode Path field", async () => {
    expect(await checkZip(makeZip({ "MV.dot": Buffer.from("a") }, { unicodeNames: { "MV.dot": "z.dot" } }))).toEqual({
      ok: false,
      error: { code: "file.twoNames", names: ["MV.dot"] },
    });
    expect(await checkZip(makeZip({ "MV.dot": Buffer.from("a") }, { unicodeNames: { "MV.dot": "MV.dot" } }))).toEqual({
      ok: true,
      entries: ["MV.dot"],
    });
  });

  it("refuses a ~ in a name, and a name part that ends with a dot or a space", async () => {
    for (const bad of ["NEXTZX~1/A.TXT", "GAME./A.TXT", "GAME /A.TXT", "GAME/A.", "GAME/A ", "./A.TXT", "GAME\\B./A.TXT"]) {
      expect(await checkZip(makeZip({ "OK.TXT": Buffer.from("a"), [bad]: Buffer.from("a") }))).toEqual({
        ok: false,
        error: { code: "file.badNames", names: [bad] },
      });
    }
    expect((await checkZip(makeZip({ ".HIDDEN/A.B.TXT": Buffer.from("a"), "README.TXT": Buffer.from("b") }))).ok).toBe(true);
  });

  it("refuses a zip whose files add up to more than 16 MB unpacked", async () => {
    const half = MAX_UNPACKED_BYTES / 2;
    expect(await checkZip(makeZip({ "A.BIN": Buffer.from("a"), "B.BIN": Buffer.from("b") }, { method: 8, usize: half }))).toEqual({
      ok: true,
      entries: ["A.BIN", "B.BIN"],
    });
    expect(
      await checkZip(makeZip({ "A.BIN": Buffer.from("a"), "B.BIN": Buffer.from("b") }, { method: 8, usize: half + 1 })),
    ).toEqual({ ok: false, error: { code: "file.unpackedTooLarge", max: MAX_UNPACKED_BYTES } });
  });

  it("refuses macOS files at any depth, naming each one, and a __MACOSX directory once", async () => {
    for (const bad of [".DS_Store", "GAME/.DS_Store", "GAME/SUB/.ds_store", "._README.TXT", "GAME/._MAIN.BAS", "._GAME/A.TXT"]) {
      expect(await checkZip(makeZip({ "README.TXT": Buffer.from("a"), [bad]: Buffer.from("a") }))).toEqual({
        ok: false,
        error: { code: "file.macFiles", names: [bad] },
      });
    }
    expect(
      await checkZip(
        makeZip({
          "README.TXT": Buffer.from("a"),
          "__MACOSX/": Buffer.alloc(0),
          "__MACOSX/._README.TXT": Buffer.from("a"),
          "GAME/__MACOSX/A.TXT": Buffer.from("a"),
        }),
      ),
    ).toEqual({ ok: false, error: { code: "file.macFiles", names: ["__MACOSX/", "GAME/__MACOSX/"] } });
  });

  it("accepts names that only look like macOS files", async () => {
    expect((await checkZip(makeZip({ "README.TXT": Buffer.from("a"), "GAME/A._B.TXT": Buffer.from("a"), "MACOSX/DS_STORE": Buffer.from("a") }))).ok).toBe(true);
  });

  it("refuses a zip whose entries are all in one top-level directory, naming it", async () => {
    const oneDirectory = { ok: false, error: { code: "file.oneDirectory", names: ["GAME"] } };
    expect(await checkZip(makeZip({ "GAME/": Buffer.alloc(0), "GAME/MAIN.BAS": Buffer.from("a"), "GAME/SUB/A.TXT": Buffer.from("b") }))).toEqual(oneDirectory);
    expect(await checkZip(makeZip({ "GAME/MAIN.BAS": Buffer.from("a"), "game\\A.TXT": Buffer.from("b") }))).toEqual(oneDirectory);
    expect((await checkZip(makeZip({ "GAME/MAIN.BAS": Buffer.from("a"), "TOOLS/A.TXT": Buffer.from("b") }))).ok).toBe(true);
    expect((await checkZip(makeZip({ "MAIN.BAS": Buffer.from("a") }))).ok).toBe(true);
  });
});
