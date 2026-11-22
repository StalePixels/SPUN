import "server-only";
import { asc, eq, exists, inArray, isNull, and, ne, or, sql } from "drizzle-orm";
import { aliases, appDepends, apps, users } from "@/db/schema";
import { notifyAppEdit, ownedApp, parseAppId, type AppId } from "./apps";
import { isPublic, matches, shownIn } from "./catalogue";
import { db } from "./db";
import { appSnapshot } from "./notify";
import type { Problem } from "./problems";
import { checkDepends, DEPENDS_SEARCH_MAX } from "./rules";

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

export type DependsApp = { id: AppId; title: string; username: string | null; deleted: boolean };

function dependsAppQuery() {
  return db()
    .select({ id: apps.id, title: apps.title, username: users.username, deletedAt: apps.deletedAt })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId));
}

function dependsApp(row: { id: AppId; title: string; username: string | null; deletedAt: Date | null }): DependsApp {
  return { id: row.id, title: row.title, username: row.username, deleted: row.deletedAt !== null };
}

export async function dependsApps(ids: AppId[]): Promise<DependsApp[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await dependsAppQuery().where(inArray(apps.id, ids)).orderBy(asc(apps.title), asc(apps.id));
  return rows.map(dependsApp);
}

// The owner's own apps need no release to be listed: setDepends accepts any app that is not deleted.
export async function ownDependsChoices(ownerId: string, appId: AppId): Promise<DependsApp[]> {
  const rows = await dependsAppQuery()
    .where(and(eq(apps.userId, ownerId), ne(apps.id, appId), isNull(apps.deletedAt)))
    .orderBy(asc(apps.title), asc(apps.id));
  return rows.map(dependsApp);
}

export async function searchOwnDepends(
  userId: string,
  appId: AppId,
  query: string,
): Promise<{ error: Problem } | { apps: DependsApp[] }> {
  if (!(await ownedApp(userId, appId))) {
    return { error: { code: "app.notFound" } };
  }
  return { apps: await searchDepends(userId, appId, query) };
}

// Public apps found as the catalogue finds them: listed and unlisted ones, and the owner's
// secret ones. An exact id or alias finds any public app, secret ones too.
export async function searchDepends(ownerId: string, appId: AppId, query: string): Promise<DependsApp[]> {
  const text = query.trim();
  if (text === "") {
    return [];
  }
  const id = parseAppId(text);
  const named = or(
    ...(id ? [eq(apps.id, id)] : []),
    exists(db().select({ one: sql`1` }).from(aliases).where(and(eq(aliases.appId, apps.id), eq(aliases.alias, text)))),
  );
  const rows = await dependsAppQuery()
    .where(and(isPublic(), ne(apps.id, appId), or(named, and(shownIn(["listed", "unlisted"], ownerId), matches(text)))))
    .orderBy(asc(apps.title), asc(apps.id))
    .limit(DEPENDS_SEARCH_MAX);
  return rows.map(dependsApp);
}
