import { describe, expect, it } from "vitest";
import { formatMinCore, parseMinCore } from "./mincore";

describe("parseMinCore", () => {
  it("reads an empty input as no minimum, also with spaces", () => {
    expect(parseMinCore("")).toEqual({ ok: true, minCore: null });
    expect(parseMinCore("  ")).toEqual({ ok: true, minCore: null });
  });

  it("packs major.minor.sub as (major << 16) | (minor << 8) | sub", () => {
    expect(parseMinCore("3.01.10")).toEqual({ ok: true, minCore: 0x03010a });
    expect(parseMinCore(" 3.01.10 ")).toEqual({ ok: true, minCore: 0x03010a });
    expect(parseMinCore("0.00.00")).toEqual({ ok: true, minCore: 0 });
    expect(parseMinCore("15.15.255")).toEqual({ ok: true, minCore: 0x0f0fff });
  });

  it("accepts a minor or sub number with or without a leading zero", () => {
    expect(parseMinCore("3.1.9")).toEqual(parseMinCore("3.01.09"));
    expect(parseMinCore("2.00.28")).toEqual({ ok: true, minCore: 0x02001c });
  });

  it("refuses text that is not major.minor.sub", () => {
    for (const input of ["3", "3.1", "3.01.10.1", "a.b.c", "3.01.x", "-3.01.10", "3,01,10", "3..10", ".1.2", "003.01.10", "3.001.10", "3.01.1000", "3 .01.10", "1e1.0.0"]) {
      expect(parseMinCore(input), input).toEqual({ ok: false, error: { code: "minCore.format" } });
    }
  });

  it("refuses a major or minor number above 15 and a sub number above 255", () => {
    for (const input of ["16.00.00", "3.16.00", "3.01.256", "99.99.999"]) {
      expect(parseMinCore(input), input).toEqual({ ok: false, error: { code: "minCore.range" } });
    }
  });
});

describe("formatMinCore", () => {
  it("shows null as an empty field", () => {
    expect(formatMinCore(null)).toBe("");
  });

  it("shows major.minor.sub with the minor and sub numbers on two digits", () => {
    expect(formatMinCore(0x03010a)).toBe("3.01.10");
    expect(formatMinCore(0x020001)).toBe("2.00.01");
    expect(formatMinCore(0x0f0fff)).toBe("15.15.255");
    expect(formatMinCore(0)).toBe("0.00.00");
  });

  it("gives back what parseMinCore read, for every value the form allows", () => {
    for (const input of ["3.01.10", "2.00.28", "15.15.255", "0.00.00", "1.09.99"]) {
      const parsed = parseMinCore(input);
      expect(parsed.ok && formatMinCore(parsed.minCore)).toBe(input);
    }
  });
});
