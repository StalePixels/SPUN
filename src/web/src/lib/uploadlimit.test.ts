import { describe, expect, it } from "vitest";
import type { RateDeps } from "./apigate";
import { checkUploadRate } from "./uploadlimit";

// 10:10:00 UTC: 50 minutes before the hour ends.
const START_MS = Date.UTC(2026, 9, 4, 10, 10, 0);

function fakeRedis() {
  let now = START_MS;
  const counts = new Map<string, { value: number; expires: number }>();
  const deps: RateDeps = {
    nowMs: () => now,
    count: async (name, ttl) => {
      const entry = counts.get(name);
      const value = entry && entry.expires > now ? entry.value + 1 : 1;
      counts.set(name, { value, expires: now + ttl * 1000 });
      return value;
    },
  };
  return { deps, advance: (seconds: number) => (now += seconds * 1000) };
}

describe("checkUploadRate", () => {
  it("allows the limit in one hour, then gives upload.tooMany with the seconds to the next hour", async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 3; i++) {
      expect(await checkUploadRate(redis.deps, "user-1", 3)).toBeNull();
    }
    expect(await checkUploadRate(redis.deps, "user-1", 3)).toEqual({ code: "upload.tooMany", max: 3, wait: 50 * 60 });
    redis.advance(50 * 60);
    expect(await checkUploadRate(redis.deps, "user-1", 3)).toBeNull();
  });

  it("counts each user on their own, whatever key or form they use", async () => {
    const redis = fakeRedis();
    expect(await checkUploadRate(redis.deps, "user-1", 1)).toBeNull();
    expect(await checkUploadRate(redis.deps, "user-2", 1)).toBeNull();
    expect(await checkUploadRate(redis.deps, "user-1", 1)).toMatchObject({ code: "upload.tooMany" });
  });

  it("refuses every upload with a limit of 0", async () => {
    expect(await checkUploadRate(fakeRedis().deps, "user-1", 0)).toMatchObject({ code: "upload.tooMany", max: 0 });
  });
});
