import "server-only";
import Redis from "ioredis";
import { requireEnv } from "./env";

let instance: Redis | undefined;

function redis(): Redis {
  if (!instance) {
    instance = new Redis(requireEnv("REDIS_URL"));
  }
  return instance;
}

// Every key starts with REDIS_PREFIX, so a second CMS on the same Redis keeps its own keys.
function prefixed(name: string): string {
  return `${process.env.REDIS_PREFIX || "spun:"}${name}`;
}

export function claimsKey(userId: string): string {
  return prefixed(`claims:${userId}`);
}

// Replaces the whole set, so claims byob-oidc drops also go.
export async function storeClaims(userId: string, claims: object): Promise<void> {
  await redis().set(claimsKey(userId), JSON.stringify(claims));
}

export async function claimOnce(name: string, ttlSeconds: number): Promise<boolean> {
  return (await redis().set(prefixed(name), "1", "EX", ttlSeconds, "NX")) === "OK";
}

export async function countHit(name: string, ttlSeconds: number): Promise<number> {
  const key = prefixed(name);
  const results = await redis().multi().incr(key).expire(key, ttlSeconds).exec();
  const [error, value] = results?.[0] ?? [new Error("Redis returned no result for INCR."), null];
  if (error) {
    throw error;
  }
  return Number(value);
}
