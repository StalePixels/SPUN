import type { Problem } from "./problems";

const MAJOR_MAX = 15;
const MINOR_MAX = 15;
const SUB_MAX = 255;

export type MinCoreInput = { ok: true; minCore: number | null } | { ok: false; error: Problem };

// The core version is major.minor.sub, packed as (major << 16) | (minor << 8) | sub.
// The major and minor numbers are nibbles of NextReg 0x01.
export function parseMinCore(input: string): MinCoreInput {
  const value = input.trim();
  if (value === "") {
    return { ok: true, minCore: null };
  }
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{1,3})$/.exec(value);
  if (!match) {
    return { ok: false, error: { code: "minCore.format" } };
  }
  const [major, minor, sub] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (major > MAJOR_MAX || minor > MINOR_MAX || sub > SUB_MAX) {
    return { ok: false, error: { code: "minCore.range" } };
  }
  return { ok: true, minCore: (major << 16) | (minor << 8) | sub };
}

// Core 3.01.10 is 0x03010A.
export function formatMinCore(minCore: number | null): string {
  if (minCore === null) {
    return "";
  }
  const major = (minCore >> 16) & 255;
  const minor = (minCore >> 8) & 255;
  const sub = minCore & 255;
  return `${major}.${String(minor).padStart(2, "0")}.${String(sub).padStart(2, "0")}`;
}
