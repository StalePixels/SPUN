import yauzl from "yauzl";
import type { Problem } from "./problems";
import { MAX_UNPACKED_BYTES, MAX_UPLOAD_BYTES } from "./rules";

type ZipProblem = "file.notZip" | "file.incompatible";

// yauzl's messages for zips that it reads but the Next cannot install.
const YAUZL_INCOMPATIBLE =
  /^(absolute path|invalid relative path|multi-disk zip files are not supported|strong encryption is not supported)/;

// The shortest install directory, "C:", leaves 252 bytes for a name in the
// unzipper's 256-byte path. A longer directory leaves less.
export const NEXT_NAME_MAX = 252;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_SIZE = 0xffffffff;
const UNICODE_PATH_EXTRA = 0x7075;
const BAD_NAME_BYTE = /[^\x20-\x7e]|["*<>?|~]/;
// FAT drops a dot or space at the end of a name, so the part would land on another name.
const BAD_NAME_PART = /[. ]$/;

// For the message only: a name in UTF-8 reads back as UTF-8, anything else byte for byte.
function displayName(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return raw.toString("latin1");
  }
}

// The Info-ZIP Unicode Path field: version 1, the CRC of the raw name, then the name in UTF-8.
function unicodeName(data: Buffer, from: number, to: number): Buffer | null {
  for (let at = from; at + 4 <= to; ) {
    const size = data.readUInt16LE(at + 2);
    if (data.readUInt16LE(at) === UNICODE_PATH_EXTRA && size >= 5 && at + 4 + size <= to) {
      return data.subarray(at + 9, at + 4 + size);
    }
    at += 4 + size;
  }
  return null;
}

export type NextZip = { ok: true; entries: string[] } | { ok: false; error: ZipProblem | Problem };

// The rules of the Next's unzipper (src/client/unzip/unzip.c), applied to the
// raw records in its order, plus entry names in printable ASCII that FAT allows.
// The names are the raw central directory names the unzipper uses.
export function readNextZip(data: Buffer): NextZip {
  const fail = (error: ZipProblem | Problem): NextZip => ({ ok: false, error });
  if (data.length < 22) return fail("file.notZip");
  const stop = Math.max(0, data.length - 22 - 0xffff);
  let end = -1;
  for (let at = data.length - 22; at >= stop; at--) {
    if (data.readUInt32LE(at) === EOCD_SIG) {
      end = at;
      break;
    }
  }
  if (end < 0) return fail("file.notZip");
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) return fail("file.incompatible");
  const count = data.readUInt16LE(end + 10);
  if (count === 0xffff || data.readUInt16LE(end + 8) !== count) return fail("file.incompatible");
  let at = data.readUInt32LE(end + 16);
  if (at === ZIP64_SIZE) return fail("file.incompatible");

  const entries: string[] = [];
  const badNames: string[] = [];
  const twoNames: string[] = [];
  let unpacked = 0;
  for (let entry = 0; entry < count; entry++) {
    if (at + 46 > data.length || data.readUInt32LE(at) !== CENTRAL_SIG) return fail("file.notZip");
    const nameLength = data.readUInt16LE(at + 28);
    if (nameLength === 0 || nameLength > NEXT_NAME_MAX) return fail("file.incompatible");
    const extraEnd = at + 46 + nameLength + data.readUInt16LE(at + 30);
    if (extraEnd > data.length) return fail("file.notZip");
    const raw = data.subarray(at + 46, at + 46 + nameLength);
    const name = raw.toString("latin1");
    if (BAD_NAME_BYTE.test(name) || name.split(/[/\\]/).some((part) => BAD_NAME_PART.test(part))) {
      badNames.push(displayName(raw));
    }
    const unicode = unicodeName(data, at + 46 + nameLength, extraEnd);
    if (unicode && !unicode.equals(raw)) {
      twoNames.push(displayName(raw));
    }
    if (data.readUInt16LE(at + 8) & 1) return fail("file.incompatible");
    const method = data.readUInt16LE(at + 10);
    if (method !== 0 && method !== 8) return fail("file.incompatible");
    if (data.readUInt32LE(at + 20) === ZIP64_SIZE || data.readUInt32LE(at + 24) === ZIP64_SIZE) {
      return fail("file.incompatible");
    }
    if (/^[/\\]/.test(name) || name.includes(":") || name.split(/[/\\]/).includes("..")) {
      return fail("file.incompatible");
    }
    if (!name.endsWith("/")) {
      const local = data.readUInt32LE(at + 42);
      if (local + 30 > data.length || data.readUInt32LE(local) !== LOCAL_SIG) return fail("file.notZip");
    }
    unpacked += data.readUInt32LE(at + 24);
    entries.push(name);
    at = extraEnd + data.readUInt16LE(at + 32);
  }
  if (unpacked > MAX_UNPACKED_BYTES) return fail({ code: "file.unpackedTooLarge", max: MAX_UNPACKED_BYTES });
  if (twoNames.length > 0) return fail({ code: "file.twoNames", names: [...new Set(twoNames)] });
  if (badNames.length > 0) return fail({ code: "file.badNames", names: [...new Set(badNames)] });
  return { ok: true, entries };
}

export type ZipCheck = { ok: true; entries: string[] } | { ok: false; error: Problem };

// Reads the central directory only. No entry is decompressed. yauzl checks the
// structure; it is not asked for names, as it would take the Unicode Path field.
export function checkZip(data: Buffer): Promise<ZipCheck> {
  if (data.length > MAX_UPLOAD_BYTES) {
    return Promise.resolve({
      ok: false,
      error: { code: "file.tooLarge" },
    });
  }
  return new Promise((resolve) => {
    const reject = (code: ZipProblem) =>
      resolve({
        ok: false,
        error: { code },
      });
    const rejectError = (error: Error) =>
      reject(YAUZL_INCOMPATIBLE.test(error.message) ? "file.incompatible" : "file.notZip");
    yauzl.fromBuffer(data, { lazyEntries: true, decodeStrings: false }, (err, zip) => {
      if (err || !zip) {
        rejectError(err ?? new Error("no zip"));
        return;
      }
      zip.on("entry", () => zip.readEntry());
      zip.on("end", () => {
        const next = readNextZip(data);
        if (next.ok) resolve(next);
        else if (typeof next.error === "string") reject(next.error);
        else resolve({ ok: false, error: next.error });
      });
      zip.on("error", rejectError);
      zip.readEntry();
    });
  });
}
