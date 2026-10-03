import yauzl from "yauzl";
import type { Problem } from "./problems";
import { MAX_UPLOAD_BYTES } from "./rules";

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
const BAD_NAME_BYTE = /[^\x20-\x7e]|["*<>?|]/;

// For the message only: a name in UTF-8 reads back as UTF-8, anything else byte for byte.
function displayName(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return raw.toString("latin1");
  }
}

// The rules of the Next's unzipper (src/client/unzip/unzip.c), applied to the
// raw records in its order, plus entry names in printable ASCII that FAT allows.
export function nextUnzipProblem(data: Buffer): ZipProblem | Problem | null {
  if (data.length < 22) return "file.notZip";
  const stop = Math.max(0, data.length - 22 - 0xffff);
  let end = -1;
  for (let at = data.length - 22; at >= stop; at--) {
    if (data.readUInt32LE(at) === EOCD_SIG) {
      end = at;
      break;
    }
  }
  if (end < 0) return "file.notZip";
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) return "file.incompatible";
  const entries = data.readUInt16LE(end + 10);
  if (entries === 0xffff || data.readUInt16LE(end + 8) !== entries) return "file.incompatible";
  let at = data.readUInt32LE(end + 16);
  if (at === ZIP64_SIZE) return "file.incompatible";

  const badNames: string[] = [];
  for (let entry = 0; entry < entries; entry++) {
    if (at + 46 > data.length || data.readUInt32LE(at) !== CENTRAL_SIG) return "file.notZip";
    const nameLength = data.readUInt16LE(at + 28);
    if (nameLength === 0 || nameLength > NEXT_NAME_MAX) return "file.incompatible";
    if (at + 46 + nameLength > data.length) return "file.notZip";
    const name = data.toString("latin1", at + 46, at + 46 + nameLength);
    if (BAD_NAME_BYTE.test(name)) {
      badNames.push(displayName(data.subarray(at + 46, at + 46 + nameLength)));
    }
    if (data.readUInt16LE(at + 8) & 1) return "file.incompatible";
    const method = data.readUInt16LE(at + 10);
    if (method !== 0 && method !== 8) return "file.incompatible";
    if (data.readUInt32LE(at + 20) === ZIP64_SIZE || data.readUInt32LE(at + 24) === ZIP64_SIZE) {
      return "file.incompatible";
    }
    if (/^[/\\]/.test(name) || name.includes(":") || name.split(/[/\\]/).includes("..")) {
      return "file.incompatible";
    }
    if (!name.endsWith("/")) {
      const local = data.readUInt32LE(at + 42);
      if (local + 30 > data.length || data.readUInt32LE(local) !== LOCAL_SIG) return "file.notZip";
    }
    at += 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
  }
  return badNames.length > 0 ? { code: "file.badNames", names: [...new Set(badNames)] } : null;
}

export type ZipCheck = { ok: true; entries: string[] } | { ok: false; error: Problem };

// Reads the central directory only. No entry is decompressed.
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
    yauzl.fromBuffer(data, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        rejectError(err ?? new Error("no zip"));
        return;
      }
      const entries: string[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        entries.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => {
        const problem = nextUnzipProblem(data);
        if (typeof problem === "string") reject(problem);
        else if (problem) resolve({ ok: false, error: problem });
        else resolve({ ok: true, entries });
      });
      zip.on("error", rejectError);
      zip.readEntry();
    });
  });
}
