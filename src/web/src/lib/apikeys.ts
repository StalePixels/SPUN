import "server-only";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { apiKeys, users } from "@/db/schema";
import type { ApiKeyUser } from "./apigate";
import { db } from "./db";
import { requireEnv } from "./env";
import { keySecret, keyString, newKeyId } from "./keys";
import type { Problem } from "./problems";
import { checkKeyName } from "./rules";

export type ApiKeyRow = { id: string; name: string; createdAt: Date };

export function serverKey(): string {
  return requireEnv("API_KEY_SECRET");
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return db()
    .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.deletedAt)))
    .orderBy(desc(apiKeys.createdAt), apiKeys.id);
}

export async function createApiKey(userId: string, name: string): Promise<{ error?: Problem; key?: string }> {
  const error = checkKeyName(name);
  if (error) {
    return { error };
  }
  for (;;) {
    const id = newKeyId();
    const [taken] = await db().select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, id));
    if (!taken) {
      await db().insert(apiKeys).values({ id, userId, name });
      return { key: keyString(id, keySecret(serverKey(), id)) };
    }
  }
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
  await db()
    .update(apiKeys)
    .set({ deletedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.deletedAt)));
}

export async function apiKeyUser(keyId: string): Promise<ApiKeyUser | null> {
  const [row] = await db()
    .select({ id: users.id, username: users.username, acceptedTermsId: users.acceptedTermsId })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(
      and(
        eq(apiKeys.id, keyId),
        isNull(apiKeys.deletedAt),
        isNull(users.disabledAt),
        isNotNull(users.username),
      ),
    );
  return row?.username ? { id: row.id, username: row.username, acceptedTermsId: row.acceptedTermsId } : null;
}
