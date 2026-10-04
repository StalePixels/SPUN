import type { Problem } from "./problems";

export type DotMove = { file: string; to: string };

// The dot commands the Next distribution ships: the files at the top of
// tbblue/dot, without extra/. Update it when tbblue changes them.
export const NEXT_DOT_COMMANDS = [
  "$",
  "BACKOFF",
  "BACKON",
  "BAS2TXT",
  "BMP2SPR",
  "BMPCONV",
  "BMPLOAD",
  "BROWSE",
  "BROWSEPREFS",
  "CD",
  "CHMOD",
  "CLEAR",
  "CONFIG",
  "CORE",
  "COWSAY",
  "CP",
  "CPM",
  "CRC32",
  "DATE",
  "DEFRAG",
  "DISPLAYEDGE",
  "DZX7",
  "ECHO",
  "EDITPREFS",
  "ESPBAUD",
  "ESPUPDATE",
  "EXTRACT",
  "FIND",
  "GUIDE",
  "HTTP",
  "I2CSCAN",
  "INSTALL",
  "LFN",
  "LS",
  "LSTAP",
  "MAKELNK",
  "MAKERUN",
  "MAKETBU",
  "MEM",
  "METADATA",
  "MKDATA",
  "MKDIR",
  "MKSWAP",
  "MORE",
  "MV",
  "NBNGET",
  "NDAWPLAY",
  "NEXLOAD",
  "NEXTVER",
  "NXMOD",
  "NXTP",
  "NextPiUI",
  "PI2C",
  "PIGET",
  "PIPUT",
  "PIVER",
  "PLAYPT3",
  "PLAYVID",
  "PS2MODE",
  "QE",
  "RET",
  "RM",
  "RMDIR",
  "RUN",
  "SHOWSIMG",
  "SPREDIT",
  "SPUI",
  "STRINGS",
  "TAPEIN",
  "TAPEOUT",
  "TCPPING",
  "TESTSPR",
  "TIME",
  "TOSPRRAM",
  "TXT2BAS",
  "UART",
  "UNINSTALL",
  "UNZIP",
  "UUENCODE",
  "XPER",
  "asm",
  "bfind",
  "boot",
  "dontrun",
  "ed",
  "loadraw",
  "pisend",
  "playaky9",
  "playraw",
  "playwav",
  "term",
  "zed",
];

// SPUN's own dot command is reserved too: only an app with an override for it ships it.
export const RESERVED_DOT_COMMANDS = [...NEXT_DOT_COMMANDS, "spun"];

const RESERVED_KEYS = new Set(RESERVED_DOT_COMMANDS.map((name) => name.toLowerCase()));

export function isReservedDotName(name: string): boolean {
  return RESERVED_KEYS.has(name.toLowerCase());
}

// .spun moves each .dot file at the root of the zip to C:/dot after an install.
export function dotMoves(entries: string[]): DotMove[] {
  return [...new Set(entries)]
    .filter((file) => !file.includes("/") && /^.+\.dot$/i.test(file))
    .map((file) => ({ file, to: `C:/dot/${file.slice(0, -4)}` }));
}

// FAT drops a dot or a space at the end of a name, so "LS .dot" would land on LS.
export function checkDotMoves(moves: DotMove[], overrides: string[] = []): Problem | null {
  const names = moves.map((move) => move.file.slice(0, -4));
  const badEnds = names.filter((name) => /[. ]$/.test(name));
  if (badEnds.length > 0) {
    return { code: "file.dotNameEnd", names: badEnds };
  }
  const allowed = new Set(overrides.map((name) => name.toLowerCase()));
  const taken = names.filter((name) => isReservedDotName(name) && !allowed.has(name.toLowerCase()));
  return taken.length > 0 ? { code: "file.dotCommandTaken", names: taken } : null;
}

export type DotOverrideCheck = { ok: true; name: string } | { ok: false; error: Problem };

export function checkDotOverride(input: string): DotOverrideCheck {
  const name = input.trim().toLowerCase();
  return isReservedDotName(name) ? { ok: true, name } : { ok: false, error: { code: "dotOverride.notReserved" } };
}
