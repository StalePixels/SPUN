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

export function claimsKey(userId: string): string {
  return `spun:claims:${userId}`;
}

// Replaces the whole set, so claims byob-oidc drops also go.
export async function storeClaims(userId: string, claims: object): Promise<void> {
  await redis().set(claimsKey(userId), JSON.stringify(claims));
}
