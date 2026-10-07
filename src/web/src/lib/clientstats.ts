export const STATS_RANGES = [30, 90, 365] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const DEFAULT_STATS_RANGE: StatsRange = 90;

export const STATS_MEASURES = ["addresses", "connections"] as const;
export type StatsMeasure = (typeof STATS_MEASURES)[number];
export const DEFAULT_STATS_MEASURE: StatsMeasure = "addresses";

export const DEFAULT_STATS_KEY = "version";

type Param = string | string[] | undefined;

function single(raw: Param): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseStatsRange(raw: Param): StatsRange {
  const days = Number(single(raw));
  return STATS_RANGES.find((range) => range === days) ?? DEFAULT_STATS_RANGE;
}

export function parseStatsMeasure(raw: Param): StatsMeasure {
  const measure = single(raw);
  return STATS_MEASURES.find((m) => m === measure) ?? DEFAULT_STATS_MEASURE;
}

export function pickStatsKey(raw: Param, keys: string[]): string | null {
  const key = single(raw);
  if (key !== undefined && keys.includes(key)) {
    return key;
  }
  return keys.includes(DEFAULT_STATS_KEY) ? DEFAULT_STATS_KEY : (keys[0] ?? null);
}

// UTC days as YYYY-MM-DD, oldest first, the last one today.
export function statsDays(range: number, now: Date): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: range }, (_, i) =>
    new Date(today - (range - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

export type StatsCount = { day: string; value: string; n: number };
export type StatsPoint = { day: string; counts: number[] };
export type StatsSeries = {
  values: string[];
  totals: number[];
  points: StatsPoint[];
};

// Values by total, largest first; counts[i] belongs to values[i]. Days with no row are 0.
export function shapeStats(rows: StatsCount[], days: string[]): StatsSeries {
  const inRange = new Set(days);
  const byValue = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!inRange.has(row.day)) continue;
    const perDay = byValue.get(row.value) ?? new Map<string, number>();
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.n);
    byValue.set(row.value, perDay);
  }
  const series = [...byValue].map(([value, perDay]) => ({
    value,
    perDay,
    total: [...perDay.values()].reduce((sum, n) => sum + n, 0),
  }));
  series.sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
  return {
    values: series.map((s) => s.value),
    totals: series.map((s) => s.total),
    points: days.map((day) => ({ day, counts: series.map((s) => s.perDay.get(day) ?? 0) })),
  };
}
