import { describe, expect, it } from "vitest";
import { parseStatsMeasure, parseStatsRange, pickStatsKey, shapeStats, statsDays } from "./clientstats";

describe("parseStatsRange", () => {
  it("accepts the fixed ranges", () => {
    expect(parseStatsRange("30")).toBe(30);
    expect(parseStatsRange("90")).toBe(90);
    expect(parseStatsRange("365")).toBe(365);
  });

  it("falls back to 90 days for anything else", () => {
    for (const raw of [undefined, "", "7", "abc", "30.5", "-30"]) {
      expect(parseStatsRange(raw), String(raw)).toBe(90);
    }
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseStatsRange(["365", "30"])).toBe(365);
  });
});

describe("parseStatsMeasure", () => {
  it("accepts addresses and connections, and defaults to addresses", () => {
    expect(parseStatsMeasure("connections")).toBe("connections");
    expect(parseStatsMeasure("addresses")).toBe("addresses");
    expect(parseStatsMeasure(undefined)).toBe("addresses");
    expect(parseStatsMeasure("CONNECTIONS")).toBe("addresses");
    expect(parseStatsMeasure(["connections"])).toBe("connections");
  });
});

describe("pickStatsKey", () => {
  it("keeps a key that has rows", () => {
    expect(pickStatsKey("model", ["model", "version"])).toBe("model");
  });

  it("defaults to version, or else the first key", () => {
    expect(pickStatsKey(undefined, ["model", "version"])).toBe("version");
    expect(pickStatsKey("unknown", ["model", "version"])).toBe("version");
    expect(pickStatsKey(undefined, ["core", "model"])).toBe("core");
  });

  it("is null with no keys", () => {
    expect(pickStatsKey("version", [])).toBeNull();
  });
});

describe("statsDays", () => {
  it("lists UTC days, oldest first, ending today", () => {
    expect(statsDays(3, new Date("2026-03-01T23:30:00Z"))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("has one day per day of the range", () => {
    const days = statsDays(365, new Date("2026-10-07T00:00:00Z"));
    expect(days).toHaveLength(365);
    expect(days[0]).toBe("2025-10-08");
    expect(days[364]).toBe("2026-10-07");
  });
});

describe("shapeStats", () => {
  const days = ["2026-10-01", "2026-10-02", "2026-10-03"];

  it("fills missing days with 0 and orders values by total", () => {
    const shaped = shapeStats(
      [
        { day: "2026-10-01", value: "0.7.1", n: 2 },
        { day: "2026-10-03", value: "0.7.1", n: 1 },
        { day: "2026-10-02", value: "0.7.2", n: 5 },
      ],
      days,
    );
    expect(shaped.values).toEqual(["0.7.2", "0.7.1"]);
    expect(shaped.totals).toEqual([5, 3]);
    expect(shaped.points).toEqual([
      { day: "2026-10-01", counts: [0, 2] },
      { day: "2026-10-02", counts: [5, 0] },
      { day: "2026-10-03", counts: [0, 1] },
    ]);
  });

  it("orders equal totals by value", () => {
    const shaped = shapeStats(
      [
        { day: "2026-10-01", value: "b", n: 1 },
        { day: "2026-10-01", value: "a", n: 1 },
      ],
      days,
    );
    expect(shaped.values).toEqual(["a", "b"]);
  });

  it("ignores days outside the range", () => {
    const shaped = shapeStats([{ day: "2026-09-30", value: "0.7.1", n: 4 }], days);
    expect(shaped.values).toEqual([]);
    expect(shaped.points.map((p) => p.counts)).toEqual([[], [], []]);
  });
});
