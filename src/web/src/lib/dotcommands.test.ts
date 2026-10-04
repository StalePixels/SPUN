import { describe, expect, it } from "vitest";
import { checkDotMoves, checkDotOverride, dotMoves, NEXT_DOT_COMMANDS, RESERVED_DOT_COMMANDS } from "./dotcommands";

describe("dotMoves", () => {
  it("moves each .dot file at the root to C:/dot, without the extension", () => {
    expect(dotMoves(["README.TXT", "spun.dot", "WIFI.DOT", "Mixed.Dot"])).toEqual([
      { file: "spun.dot", to: "C:/dot/spun" },
      { file: "WIFI.DOT", to: "C:/dot/WIFI" },
      { file: "Mixed.Dot", to: "C:/dot/Mixed" },
    ]);
  });

  it("leaves out entries below the root, directories and other extensions", () => {
    expect(
      dotMoves(["bin/spun.dot", "a/b/c.DOT", "tools.dot/", "spun.dotx", "spun.dot.bak", "dot", "spundot", ".dot"]),
    ).toEqual([]);
  });

  it("lists a name only once when the zip holds it twice", () => {
    expect(dotMoves(["spun.dot", "spun.dot"])).toEqual([{ file: "spun.dot", to: "C:/dot/spun" }]);
  });
});

describe("checkDotMoves", () => {
  it("accepts names that are not reserved", () => {
    expect(checkDotMoves(dotMoves(["mytool.dot", "spunky.dot"]))).toBeNull();
    expect(checkDotMoves([])).toBeNull();
  });

  it("refuses names the Next ships and spun, in any case, and names each clash", () => {
    expect(checkDotMoves(dotMoves(["ls.dot", "mine.dot", "Nbnget.DOT", "$.dot", "SPUN.dot"]))).toEqual({
      code: "file.dotCommandTaken",
      names: ["ls", "Nbnget", "$", "SPUN"],
    });
  });

  it("accepts a reserved name the app has an override for, in any case, and only that name", () => {
    expect(checkDotMoves(dotMoves(["SPUN.DOT", "nbnget.dot"]), ["spun", "nbnget"])).toBeNull();
    expect(checkDotMoves(dotMoves(["spun.dot", "ls.dot"]), ["spun"])).toEqual({
      code: "file.dotCommandTaken",
      names: ["ls"],
    });
  });

  it("refuses a name that ends with a dot or a space before .dot, override or not", () => {
    expect(checkDotMoves(dotMoves(["LS .dot", "ls..dot", "mine.dot", "tool .DOT"]), ["ls"])).toEqual({
      code: "file.dotNameEnd",
      names: ["LS ", "ls.", "tool "],
    });
  });

  it("ignores shipped names below the root", () => {
    expect(checkDotMoves(dotMoves(["dot/LS.DOT", "bin/unzip.dot"]))).toBeNull();
  });

  it("holds file names only, no paths or extensions", () => {
    expect(NEXT_DOT_COMMANDS.length).toBeGreaterThan(0);
    for (const name of NEXT_DOT_COMMANDS) {
      expect(name).not.toMatch(/[/.]/);
    }
  });
});

describe("checkDotOverride", () => {
  it("takes a reserved name in any case, with spaces round it, and stores it in lower case", () => {
    expect(checkDotOverride(" SPUN ")).toEqual({ ok: true, name: "spun" });
    expect(checkDotOverride("NbnGet")).toEqual({ ok: true, name: "nbnget" });
  });

  it("refuses a name that is not reserved", () => {
    expect(checkDotOverride("mytool")).toEqual({ ok: false, error: { code: "dotOverride.notReserved" } });
    expect(checkDotOverride("")).toEqual({ ok: false, error: { code: "dotOverride.notReserved" } });
  });

  it("reserves every name the Next ships, and spun", () => {
    expect(RESERVED_DOT_COMMANDS).toEqual([...NEXT_DOT_COMMANDS, "spun"]);
  });
});
