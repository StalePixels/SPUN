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

export async function countHit(name: string, ttlSeconds: number, hits = 1): Promise<number> {
  const key = prefixed(name);
  const results = await redis().multi().incrby(key, hits).expire(key, ttlSeconds).exec();
  const [error, value] = results?.[0] ?? [new Error("Redis returned no result for INCRBY."), null];
  if (error) {
    throw error;
  }
  return Number(value);
}

export async function storeValue(name: string, value: string, ttlSeconds: number): Promise<void> {
  await redis().set(prefixed(name), value, "EX", ttlSeconds);
}

export async function readValue(name: string): Promise<string | null> {
  return redis().get(prefixed(name));
}

// GETDEL: of two readers at once, only one gets the value.
export async function takeValue(name: string): Promise<string | null> {
  return redis().getdel(prefixed(name));
}

export async function storeNewValue(name: string, value: string, ttlSeconds: number): Promise<boolean> {
  return (await redis().set(prefixed(name), value, "EX", ttlSeconds, "NX")) === "OK";
}

export async function swapValue(name: string, value: string, ttlSeconds: number): Promise<string | null> {
  return (await redis().call("SET", prefixed(name), value, "EX", ttlSeconds, "GET")) as string | null;
}
