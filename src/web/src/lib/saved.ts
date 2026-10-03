import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { savedApps } from "@/db/schema";
import type { AppId } from "./apps";
import { publicApp } from "./catalogue";
import { db } from "./db";
import type { Problem } from "./problems";

export async function savedIds(userId: string, appIds: AppId[]): Promise<Set<AppId>> {
  if (appIds.length === 0) {
    return new Set();
  }
  const rows = await db()
    .select({ appId: savedApps.appId })
    .from(savedApps)
    .where(and(eq(savedApps.userId, userId), inArray(savedApps.appId, appIds)));
  return new Set(rows.map((row) => row.appId));
}

// Only a public app can be saved. A second save keeps the first save's time.
export async function saveApp(userId: string, appId: AppId): Promise<{ error?: Problem }> {
  if (!(await publicApp(appId))) {
    return { error: { code: "app.notFound" } };
  }
  await db().insert(savedApps).ignore().values({ userId, appId });
  return {};
}

export async function unsaveApp(userId: string, appId: AppId): Promise<void> {
  await db()
    .delete(savedApps)
    .where(and(eq(savedApps.userId, userId), eq(savedApps.appId, appId)));
}
