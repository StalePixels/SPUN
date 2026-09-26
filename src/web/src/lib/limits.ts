import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { apps, users } from "@/db/schema";
import { db } from "./db";
import { appLimitFor } from "./rules";
import { defaultAppLimit } from "./settings";

export async function appLimit(userId: string): Promise<number | null> {
  const [row] = await db().select({ appLimit: users.appLimit }).from(users).where(eq(users.id, userId));
  return appLimitFor(row?.appLimit ?? null, await defaultAppLimit());
}

export async function appCount(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(apps)
    .where(and(eq(apps.userId, userId), isNull(apps.deletedAt)));
  return row?.n ?? 0;
}
