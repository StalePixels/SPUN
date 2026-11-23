import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { apps, users } from "@/db/schema";
import type { AppId } from "./apps";
import { db } from "./db";
import { appLimitFor, uploadLimitBytes } from "./rules";
import { defaultAppLimit } from "./settings";

export async function appLimit(userId: string): Promise<number | null> {
  const [row] = await db().select({ appLimit: users.appLimit }).from(users).where(eq(users.id, userId));
  return appLimitFor(row?.appLimit ?? null, await defaultAppLimit());
}

export async function uploadLimit(userId: string): Promise<number> {
  const [row] = await db().select({ mb: users.uploadLimitMb }).from(users).where(eq(users.id, userId));
  return uploadLimitBytes(row?.mb ?? null);
}

export async function appUploadLimit(appId: AppId): Promise<number> {
  const [row] = await db()
    .select({ mb: users.uploadLimitMb })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(eq(apps.id, appId));
  return uploadLimitBytes(row?.mb ?? null);
}

export async function appCount(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(apps)
    .where(and(eq(apps.userId, userId), isNull(apps.deletedAt)));
  return row?.n ?? 0;
}
