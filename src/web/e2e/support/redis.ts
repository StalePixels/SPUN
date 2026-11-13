import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import Redis from "ioredis";

// The e2e CMS's Redis and upload limit, from .env.e2e-cms. The upload count
// is the CMS's own key (src/lib/uploadlimit.ts, src/lib/apigate.ts rateCheck).
const cms = parseEnv(readFileSync(path.join(__dirname, "..", "..", ".env.e2e-cms"), "utf8"));
const prefix = cms.REDIS_PREFIX ?? "";
if (!prefix.includes("e2e")) {
  throw new Error("The REDIS_PREFIX of .env.e2e-cms must contain e2e.");
}

export const uploadsPerHour = Number(cms.UPLOADS_PER_HOUR || 20);
export const keyPerMinute = Number(cms.API_KEY_PER_MINUTE || 60);

function uploadKeys(userId: string): string[] {
  const hour = Math.floor(Date.now() / 3_600_000);
  return [hour, hour + 1].map((window) => `${prefix}rate:upload:${userId}:${window}`);
}

async function withRedis<T>(work: (redis: Redis) => Promise<T>): Promise<T> {
  const redis = new Redis(cms.REDIS_URL ?? "");
  try {
    return await work(redis);
  } finally {
    redis.disconnect();
  }
}

// Sets this hour's upload count of a user, and the next hour's, in case the hour ends during the test.
export async function setUploadCount(userId: string, count: number): Promise<void> {
  await withRedis(async (redis) => {
    for (const key of uploadKeys(userId)) {
      await redis.set(key, String(count), "EX", 7200);
    }
  });
}

export async function clearUploadCount(userId: string): Promise<void> {
  await withRedis(async (redis) => {
    await redis.del(...uploadKeys(userId));
  });
}

// Sets this minute's count of a rate limit (src/lib/apigate.ts rateCheck), and the next minute's.
export async function setRateCount(name: string, count: number): Promise<void> {
  const minute = Math.floor(Date.now() / 60_000);
  await withRedis(async (redis) => {
    for (const window of [minute, minute + 1]) {
      await redis.set(`${prefix}rate:${name}:${window}`, String(count), "EX", 180);
    }
  });
}
