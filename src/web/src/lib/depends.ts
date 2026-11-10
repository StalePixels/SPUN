import "server-only";
import { asc, eq, inArray, isNull, and } from "drizzle-orm";
import { appDepends, apps } from "@/db/schema";
import { notifyAppEdit, ownedApp, type AppId } from "./apps";
import { db } from "./db";
import { appSnapshot } from "./notify";
import type { Problem } from "./problems";
import { checkDepends } from "./rules";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export async function appDependsList(appId: AppId, tx: Tx | ReturnType<typeof db> = db()): Promise<AppId[]> {
  const rows = await tx
    .select({ id: appDepends.dependsOn })
    .from(appDepends)
    .where(eq(appDepends.appId, appId))
    .orderBy(asc(appDepends.dependsOn));
  return rows.map((row) => row.id);
}

async function liveIds(ids: string[]): Promise<Set<string>> {
  const wanted = ids.map((id) => id.trim().toLowerCase()).filter((id) => id !== "");
  if (wanted.length === 0) {
    return new Set();
  }
  const rows = await db()
    .select({ id: apps.id })
    .from(apps)
    .where(and(inArray(apps.id, wanted as AppId[]), isNull(apps.deletedAt)));
  return new Set(rows.map((row) => row.id.toLowerCase()));
}

export async function setOwnDepends(
  userId: string,
  appId: AppId,
  readIds: () => Promise<string[]>,
): Promise<{ error?: Problem }> {
  if (!(await ownedApp(userId, appId))) {
    return { error: { code: "app.notFound" } };
  }
  return setDepends(userId, appId, await readIds());
}

// The caller has checked that actorId may change the app: its owner, or an admin.
export async function setDepends(actorId: string, appId: AppId, input: string[]): Promise<{ error?: Problem }> {
  const checked = checkDepends(appId, input, await liveIds(input));
  if (!checked.ok) {
    return { error: checked.error };
  }
  const before = await appSnapshot(appId);
  await db().transaction(async (tx) => {
    await tx.delete(appDepends).where(eq(appDepends.appId, appId));
    if (checked.ids.length > 0) {
      await tx.insert(appDepends).values(checked.ids.map((id) => ({ appId, dependsOn: id as AppId })));
    }
  });
  await notifyAppEdit(actorId, appId, before);
  return {};
}

// The apps that list appId, deleted ones too. The index on depends_on serves this.
export async function neededBy(appId: AppId): Promise<{ id: AppId; title: string; deleted: boolean }[]> {
  const rows = await db()
    .select({ id: apps.id, title: apps.title, deletedAt: apps.deletedAt })
    .from(appDepends)
    .innerJoin(apps, eq(apps.id, appDepends.appId))
    .where(eq(appDepends.dependsOn, appId))
    .orderBy(asc(apps.title), asc(apps.id));
  return rows.map((row) => ({ id: row.id, title: row.title, deleted: row.deletedAt !== null }));
}
