import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { aliases, apps, categories, clientLog, dotOverrides, features, releases, sessions, settings, terms, users } from "@/db/schema";
import { appIdStore, checkAliasFree, deleteApp, moveApp, notifyAppEdit, parseAppId, restoreApp, type AppId } from "./apps";
import { isPublic, matches } from "./catalogue";
import { setAppCategories } from "./categories";
import { shapeStats, statsDays, type StatsMeasure } from "./clientstats";
import { checkDotOverride } from "./dotcommands";
import { db } from "./db";
import { isDuplicateEntry } from "./dberrors";
import { isLive, liveFeature, renderArticle } from "./featured";
import type { Problem } from "./problems";
import { appSnapshot, notify, releaseSnapshot } from "./notify";
import { addRelease, appBinStore, notifyRelease, notifyReleaseEdit, type Upload } from "./releases";
import { revalidateApp, type AppRevalidation } from "./revalidate";
import { canChangeTerms, checkAlias, checkVersionUnused, currentTermsOf } from "./rules";
import { currentUser, isAdmin, requireTerms } from "./session";
import { DEFAULT_APP_LIMIT, getSetting } from "./settings";
import { databaseNow } from "./terms";
import { clearScreenshot, putScreenshot, type ScreenshotUpload } from "./screenshots";
import { binRelease, moveRelease, moveScreenshots, renameUserDir, unbinRelease, userDirExists } from "./storage";
import { usernameTaken } from "./usernames";
import { renameUser } from "./users";

// Every export calls requireAdmin() itself. Only src/app/admin/ may import this.

// A 404, so /admin looks absent to non-admins.
export async function requireAdmin(): Promise<{ id: string; username: string }> {
  const user = await currentUser();
  if (!user?.username || !(await isAdmin(user.id))) {
    notFound();
  }
  await requireTerms(user);
  return { id: user.id, username: user.username };
}

export async function adminAppLimitSetting() {
  await requireAdmin();
  return getSetting(DEFAULT_APP_LIMIT);
}

export async function adminSetAppLimit(limit: number | null): Promise<void> {
  await requireAdmin();
  await db()
    .update(settings)
    .set({ value: limit === null ? null : String(limit) })
    .where(eq(settings.slug, DEFAULT_APP_LIMIT));
}

export async function adminListUsers() {
  await requireAdmin();
  return db()
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
      appLimit: users.appLimit,
      isAdmin: users.isAdmin,
      // Deleted apps do not count.
      appCount: sql<number>`count(${apps.id}) - count(${apps.deletedAt})`,
    })
    .from(users)
    .leftJoin(apps, eq(apps.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.createdAt), asc(users.id));
}

export async function adminListApps() {
  await requireAdmin();
  return db()
    .select({
      id: apps.id,
      title: apps.title,
      owner: users.username,
      deletedAt: apps.deletedAt,
      releaseCount: count(releases.serial),
    })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .leftJoin(releases, eq(releases.appId, apps.id))
    .groupBy(apps.id)
    .orderBy(asc(apps.title));
}

export async function adminGetUser(userId: string) {
  await requireAdmin();
  const [user] = await db()
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      appLimit: users.appLimit,
      isAdmin: users.isAdmin,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user;
}

async function activeAdmin(userId: string): Promise<boolean> {
  const [user] = await db()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isAdmin, true), isNull(users.disabledAt)));
  return user !== undefined;
}

// A disabled admin cannot log in, so only enabled admins count.
async function isLastAdmin(userId: string): Promise<boolean> {
  if (!(await activeAdmin(userId))) {
    return false;
  }
  const [row] = await db()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.isAdmin, true), isNull(users.disabledAt)));
  return (row?.n ?? 0) <= 1;
}

export async function adminUpdateUser(
  userId: string,
  changes: { appLimit: number | null; isAdmin: boolean },
): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (!changes.isAdmin && (await isLastAdmin(userId))) {
    return { error: { code: "admin.lastAdmin" } };
  }
  await db().update(users).set(changes).where(eq(users.id, userId));
  return {};
}

export async function adminRenameUser(userId: string, username: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const user = await adminGetUser(userId);
  if (!user?.username) {
    return { error: { code: "user.notFound" } };
  }
  if (user.username === username) {
    return {};
  }
  if (await usernameTaken(username, userId)) {
    return { error: { code: "username.taken" } };
  }
  try {
    await renameUser(
      {
        dirExists: userDirExists,
        renameDir: renameUserDir,
        async updateUsername(id, name) {
          await db().update(users).set({ username: name }).where(eq(users.id, id));
        },
      },
      userId,
      user.username,
      username,
    );
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "username.taken" } };
    }
    throw err;
  }
  return {};
}

async function disable(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({ disabledAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.disabledAt)));
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

export async function adminDisableUser(userId: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (await isLastAdmin(userId)) {
    return { error: { code: "admin.lastAdmin" } };
  }
  await disable(userId);
  return {};
}

export async function adminEnableUser(userId: string): Promise<void> {
  await requireAdmin();
  await db().update(users).set({ disabledAt: null }).where(eq(users.id, userId));
}

// The row stays, so the username stays taken.
export async function adminDeleteUser(userId: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const user = await adminGetUser(userId);
  if (!user) {
    return { error: { code: "user.notFound" } };
  }
  if (await isLastAdmin(userId)) {
    return { error: { code: "admin.lastAdmin" } };
  }
  await disable(userId);
  const live = await db()
    .select({ id: apps.id })
    .from(apps)
    .where(and(eq(apps.userId, userId), isNull(apps.deletedAt)));
  for (const app of live) {
    await deleteApp(appBinStore(ownerName(app.id, user.username)), app.id);
  }
  return {};
}

// Every app owner has a username: only publishers create apps, and a move needs one.
function ownerName(appId: AppId, username: string | null): string {
  if (!username) {
    throw new Error(`The owner of app ${appId} has no username.`);
  }
  return username;
}

export async function adminListOwners() {
  await requireAdmin();
  return db()
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(isNotNull(users.username))
    .orderBy(asc(users.usernameLower));
}

export async function adminGetApp(appId: AppId) {
  await requireAdmin();
  const [app] = await db()
    .select({
      id: apps.id,
      title: apps.title,
      description: apps.description,
      installDir: apps.installDir,
      deletedAt: apps.deletedAt,
      ownerId: users.id,
      owner: users.username,
    })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(eq(apps.id, appId));
  return app;
}

export async function adminListAliases(appId: AppId): Promise<string[]> {
  await requireAdmin();
  const rows = await db()
    .select({ alias: aliases.alias })
    .from(aliases)
    .where(eq(aliases.appId, appId))
    .orderBy(asc(aliases.alias));
  return rows.map((row) => row.alias);
}

export async function adminAddAlias(appId: AppId, input: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const checked = checkAlias(input);
  if (!checked.ok) {
    return { error: checked.error };
  }
  if (!(await adminGetApp(appId))) {
    return { error: { code: "app.notFound" } };
  }
  const taken = await checkAliasFree(appIdStore(), checked.alias);
  if (taken) {
    return { error: taken };
  }
  try {
    await db().insert(aliases).values({ alias: checked.alias, appId });
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "alias.taken" } };
    }
    throw err;
  }
  return {};
}

export async function adminMoveAlias(appId: AppId, alias: string, rawTarget: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const target = parseAppId(rawTarget.trim());
  if (!target || !(await adminGetApp(target))) {
    return { error: { code: "app.notFound" } };
  }
  const owned = and(eq(aliases.alias, alias), eq(aliases.appId, appId));
  if ((await db().select({ alias: aliases.alias }).from(aliases).where(owned)).length === 0) {
    return { error: { code: "alias.notFound" } };
  }
  await db().update(aliases).set({ appId: target }).where(owned);
  return {};
}

// A hard delete, unlike the rest of the CMS: an alias is meant to be reused.
export async function adminRemoveAlias(appId: AppId, alias: string): Promise<void> {
  await requireAdmin();
  await db().delete(aliases).where(and(eq(aliases.alias, alias), eq(aliases.appId, appId)));
}

export async function adminListDotOverrides(appId: AppId): Promise<string[]> {
  await requireAdmin();
  const rows = await db()
    .select({ name: dotOverrides.name })
    .from(dotOverrides)
    .where(eq(dotOverrides.appId, appId))
    .orderBy(asc(dotOverrides.name));
  return rows.map((row) => row.name);
}

export async function adminAddDotOverride(appId: AppId, input: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const checked = checkDotOverride(input);
  if (!checked.ok) {
    return { error: checked.error };
  }
  if (!(await adminGetApp(appId))) {
    return { error: { code: "app.notFound" } };
  }
  try {
    await db().insert(dotOverrides).values({ appId, name: checked.name });
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "dotOverride.taken" } };
    }
    throw err;
  }
  return {};
}

export async function adminRemoveDotOverride(appId: AppId, name: string): Promise<void> {
  await requireAdmin();
  await db().delete(dotOverrides).where(and(eq(dotOverrides.appId, appId), eq(dotOverrides.name, name)));
}

export async function adminListReleases(appId: AppId) {
  await requireAdmin();
  return db().select().from(releases).where(eq(releases.appId, appId)).orderBy(desc(releases.serial));
}

export async function adminRevalidateApp(appId: AppId): Promise<AppRevalidation | null> {
  await requireAdmin();
  return revalidateApp(appId);
}

export async function adminGetRelease(appId: AppId, serial: number) {
  await requireAdmin();
  const [release] = await db()
    .select()
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  return release;
}

export async function adminUpdateApp(
  appId: AppId,
  changes: { title: string; description: string; installDir: string | null },
  categoryIds: number[],
): Promise<{ error?: Problem }> {
  const admin = await requireAdmin();
  if (!(await adminGetApp(appId))) {
    return { error: { code: "app.notFound" } };
  }
  const before = await appSnapshot(appId);
  await db().transaction(async (tx) => {
    await tx.update(apps).set(changes).where(eq(apps.id, appId));
    await setAppCategories(tx, appId, categoryIds);
  });
  await notifyAppEdit(admin.id, appId, before);
  return {};
}

export async function adminUploadRelease(
  appId: AppId,
  upload: Upload,
): Promise<{ error: Problem } | { serial: number }> {
  const admin = await requireAdmin();
  const result = await addRelease(appId, null, upload);
  if (!("error" in result)) {
    notifyRelease(admin.id, appId, result.serial, upload);
  }
  return result;
}

export async function adminDeleteApp(appId: AppId): Promise<void> {
  const admin = await requireAdmin();
  const app = await adminGetApp(appId);
  if (app && !app.deletedAt) {
    await deleteApp(appBinStore(ownerName(appId, app.owner)), appId);
    notify({ kind: "appDeleted", actorId: admin.id, appId });
  }
}

export async function adminRestoreApp(appId: AppId): Promise<void> {
  await requireAdmin();
  const app = await adminGetApp(appId);
  if (app?.deletedAt) {
    await restoreApp(appBinStore(ownerName(appId, app.owner)), appId);
  }
}

// The app limit does not apply. A deleted app's zips are in the bin, which a move does not touch.
export async function adminMoveApp(appId: AppId, userId: string): Promise<{ error?: Problem }> {
  await requireAdmin();
  const app = await adminGetApp(appId);
  if (!app) {
    return { error: { code: "app.notFound" } };
  }
  const target = await adminGetUser(userId);
  if (!target?.username) {
    return { error: { code: "user.notFound" } };
  }
  if (target.id === app.ownerId) {
    return {};
  }
  const live = app.deletedAt
    ? []
    : await db()
        .select({ serial: releases.serial })
        .from(releases)
        .where(and(eq(releases.appId, appId), isNull(releases.deletedAt)));
  await moveApp(
    {
      async moveRelease(serial, from, to) {
        await moveRelease(from, to, appId, serial);
      },
      async moveScreenshots(from, to) {
        await moveScreenshots(from, to, appId);
      },
      async updateOwner(id, ownerId) {
        await db().update(apps).set({ userId: ownerId }).where(eq(apps.id, id));
      },
    },
    appId,
    live.map((row) => row.serial),
    { from: ownerName(appId, app.owner), to: target.username, userId: target.id },
  );
  return {};
}

// A deleted app's screenshots are in the bin, so its slots cannot change.
export async function adminPutScreenshot(
  appId: AppId,
  slot: number,
  shot: ScreenshotUpload,
): Promise<{ error?: Problem }> {
  const admin = await requireAdmin();
  const app = await adminGetApp(appId);
  if (!app || app.deletedAt) {
    return { error: { code: "app.notFound" } };
  }
  const action = await putScreenshot(ownerName(appId, app.owner), appId, slot, shot);
  notify({ kind: "screenshot", actorId: admin.id, appId, slot, action });
  return {};
}

export async function adminClearScreenshot(appId: AppId, slot: number): Promise<void> {
  const admin = await requireAdmin();
  const app = await adminGetApp(appId);
  if (app && !app.deletedAt) {
    if (await clearScreenshot(ownerName(appId, app.owner), appId, slot)) {
      notify({ kind: "screenshot", actorId: admin.id, appId, slot, action: "removed" });
    }
  }
}

export async function adminUpdateRelease(
  appId: AppId,
  serial: number,
  changes: { version: string; releaseDate: string; changelog: string | null },
): Promise<{ error?: Problem }> {
  const admin = await requireAdmin();
  if (!(await adminGetRelease(appId, serial))) {
    return { error: { code: "app.notFound" } };
  }
  const before = await releaseSnapshot(appId, serial);
  const others = await db()
    .select({ version: releases.version })
    .from(releases)
    .where(and(eq(releases.appId, appId), ne(releases.serial, serial)));
  const taken = checkVersionUnused(changes.version, others.map((row) => row.version));
  if (taken) {
    return { error: taken };
  }
  try {
    await db()
      .update(releases)
      .set(changes)
      .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "version.taken" } };
    }
    throw err;
  }
  await notifyReleaseEdit(admin.id, appId, serial, before);
  return {};
}

// While the app is deleted, its zips stay in the bin; the app restore brings them back.
export async function adminDeleteRelease(appId: AppId, serial: number): Promise<void> {
  const admin = await requireAdmin();
  const app = await adminGetApp(appId);
  const release = await adminGetRelease(appId, serial);
  if (!app || !release || release.deletedAt) {
    return;
  }
  await db()
    .update(releases)
    .set({ deletedAt: new Date() })
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  if (!app.deletedAt) {
    await binRelease(ownerName(appId, app.owner), appId, serial);
  }
  notify({ kind: "releaseDeleted", actorId: admin.id, appId, serial, version: release.version });
}

export async function adminRestoreRelease(appId: AppId, serial: number): Promise<void> {
  await requireAdmin();
  const app = await adminGetApp(appId);
  const release = await adminGetRelease(appId, serial);
  if (!app || !release?.deletedAt) {
    return;
  }
  if (!app.deletedAt) {
    await unbinRelease(ownerName(appId, app.owner), appId, serial);
  }
  await db()
    .update(releases)
    .set({ deletedAt: null })
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
}

export async function adminListCategories() {
  await requireAdmin();
  return db().select().from(categories).orderBy(asc(categories.name), asc(categories.id));
}

async function slugTaken(slug: string, exceptId?: number): Promise<boolean> {
  const rows = await db().select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  return rows.some((row) => row.id !== exceptId);
}

export type CategoryFields = { slug: string; name: string; installDir: string; specificity: number };

export async function adminAddCategory(fields: CategoryFields): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (await slugTaken(fields.slug)) {
    return { error: { code: "category.taken" } };
  }
  try {
    await db().insert(categories).values(fields);
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "category.taken" } };
    }
    throw err;
  }
  return {};
}

export async function adminUpdateCategory(id: number, fields: CategoryFields): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (await slugTaken(fields.slug, id)) {
    return { error: { code: "category.taken" } };
  }
  try {
    await db().update(categories).set(fields).where(eq(categories.id, id));
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { error: { code: "category.taken" } };
    }
    throw err;
  }
  return {};
}

export async function adminDeleteCategory(id: number): Promise<void> {
  await requireAdmin();
  await db()
    .update(categories)
    .set({ deletedAt: new Date() })
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
}

export async function adminRestoreCategory(id: number): Promise<void> {
  await requireAdmin();
  await db().update(categories).set({ deletedAt: null }).where(eq(categories.id, id));
}

function appPublic() {
  return sql`${isPublic()}`.mapWith((value) => Number(value) === 1);
}

// Unlike the catalogue, it also finds apps with no live release; never deleted ones.
export async function adminSearchApps(query: string) {
  await requireAdmin();
  return db()
    .select({ id: apps.id, title: apps.title, owner: users.username, appPublic: appPublic() })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(and(isNull(apps.deletedAt), matches(query)))
    .orderBy(asc(apps.title), asc(apps.id));
}

export async function adminFeatureApp(appId: AppId) {
  await requireAdmin();
  const [app] = await db()
    .select({ id: apps.id, title: apps.title, appPublic: appPublic() })
    .from(apps)
    .where(and(eq(apps.id, appId), isNull(apps.deletedAt)));
  return app;
}

// Deleted features count: the editor starts from the article last saved.
export async function adminLastArticle(appId: AppId): Promise<string | null> {
  await requireAdmin();
  const [row] = await db()
    .select({ article: features.article })
    .from(features)
    .where(eq(features.appId, appId))
    .orderBy(desc(features.updatedAt), desc(features.id))
    .limit(1);
  return row?.article ?? null;
}

const featureColumns = {
  id: features.id,
  appId: features.appId,
  title: apps.title,
  article: features.article,
  articleHtml: features.articleHtml,
  published: features.published,
  publishAt: features.publishAt,
};

export async function adminListFeatures() {
  await requireAdmin();
  const rows = await db()
    .select({ ...featureColumns, appPublic: appPublic() })
    .from(features)
    .innerJoin(apps, eq(apps.id, features.appId))
    .where(isNull(features.deletedAt))
    .orderBy(desc(features.publishAt), desc(features.id));
  return { rows, liveId: (await liveFeature())?.id ?? null };
}

export async function adminGetFeature(id: number) {
  await requireAdmin();
  const [feature] = await db()
    .select({ ...featureColumns, appPublic: appPublic() })
    .from(features)
    .innerJoin(apps, eq(apps.id, features.appId))
    .where(and(eq(features.id, id), isNull(features.deletedAt)));
  return feature;
}

// Several features can be live at once; the home page shows the latest.
async function onlyLiveFeature(id: number): Promise<boolean> {
  const rows = await db()
    .select({ id: features.id })
    .from(features)
    .innerJoin(apps, eq(apps.id, features.appId))
    .where(isLive())
    .limit(2);
  return rows.length === 1 && rows[0].id === id;
}

// "now" is the database's clock, which decides when a feature is live.
export type FeatureFields = { article: string; published: boolean; publishAt: Date | "now" | null };

function publishAtValue(publishAt: FeatureFields["publishAt"]) {
  return publishAt === "now" ? sql`now()` : publishAt;
}

export async function adminCreateFeature(appId: AppId, fields: FeatureFields): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (!(await adminFeatureApp(appId))) {
    return { error: { code: "app.notFound" } };
  }
  await db()
    .insert(features)
    .values({
      appId,
      article: fields.article,
      articleHtml: renderArticle(fields.article),
      published: fields.published,
      publishAt: publishAtValue(fields.publishAt),
    });
  return {};
}

export async function adminUpdateFeature(id: number, fields: FeatureFields): Promise<{ error?: Problem }> {
  await requireAdmin();
  const feature = await adminGetFeature(id);
  if (!feature) {
    return { error: { code: "feature.notFound" } };
  }
  const leavesNow = !fields.published || (fields.publishAt instanceof Date && fields.publishAt > new Date());
  if (leavesNow && (await onlyLiveFeature(id))) {
    return { error: { code: "feature.lastLive" } };
  }
  await db()
    .update(features)
    .set({
      article: fields.article,
      articleHtml: renderArticle(fields.article),
      published: fields.published,
      publishAt: publishAtValue(fields.publishAt),
      updatedAt: sql`now()`,
    })
    .where(eq(features.id, id));
  return {};
}

// Keeps the publish time, so a republish puts the feature back in its place.
export async function adminUnpublishFeature(id: number): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (!(await adminGetFeature(id))) {
    return { error: { code: "feature.notFound" } };
  }
  if (await onlyLiveFeature(id)) {
    return { error: { code: "feature.lastLive" } };
  }
  await db().update(features).set({ published: false }).where(eq(features.id, id));
  return {};
}

export async function adminDeleteFeature(id: number): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (!(await adminGetFeature(id))) {
    return { error: { code: "feature.notFound" } };
  }
  if (await onlyLiveFeature(id)) {
    return { error: { code: "feature.lastLive" } };
  }
  await db().update(features).set({ deletedAt: new Date() }).where(eq(features.id, id));
  return {};
}

const termsColumns = {
  id: terms.id,
  text: terms.text,
  textHtml: terms.textHtml,
  published: terms.published,
  publishAt: terms.publishAt,
};

export async function adminListTerms() {
  await requireAdmin();
  const rows = await db()
    .select(termsColumns)
    .from(terms)
    .where(isNull(terms.deletedAt))
    .orderBy(desc(terms.publishAt), desc(terms.id));
  const now = await databaseNow();
  return { rows, now, currentId: currentTermsOf(rows, now)?.id ?? null };
}

export async function adminGetTerms(id: number) {
  await requireAdmin();
  const [version] = await db()
    .select(termsColumns)
    .from(terms)
    .where(and(eq(terms.id, id), isNull(terms.deletedAt)));
  return version;
}

export type TermsFields = { text: string; published: boolean; publishAt: Date | "now" | null };

export async function adminCreateTerms(fields: TermsFields): Promise<void> {
  await requireAdmin();
  await db()
    .insert(terms)
    .values({
      text: fields.text,
      textHtml: renderArticle(fields.text),
      published: fields.published,
      publishAt: publishAtValue(fields.publishAt),
    });
}

// The where clause also guards the moment a scheduled version goes live.
function changeable(id: number) {
  return and(
    eq(terms.id, id),
    isNull(terms.deletedAt),
    sql`not (${terms.published} and ${terms.publishAt} is not null and ${terms.publishAt} <= now())`,
  );
}

async function termsChangeProblem(id: number): Promise<Problem | null> {
  const version = await adminGetTerms(id);
  if (!version) {
    return { code: "terms.notFound" };
  }
  return canChangeTerms(version, await databaseNow()) ? null : { code: "terms.live" };
}

export async function adminUpdateTerms(id: number, fields: TermsFields): Promise<{ error?: Problem }> {
  await requireAdmin();
  const error = await termsChangeProblem(id);
  if (error) {
    return { error };
  }
  await db()
    .update(terms)
    .set({
      text: fields.text,
      textHtml: renderArticle(fields.text),
      published: fields.published,
      publishAt: publishAtValue(fields.publishAt),
      updatedAt: sql`now()`,
    })
    .where(changeable(id));
  return {};
}

export async function adminUnpublishTerms(id: number): Promise<{ error?: Problem }> {
  await requireAdmin();
  const error = await termsChangeProblem(id);
  if (error) {
    return { error };
  }
  await db().update(terms).set({ published: false }).where(changeable(id));
  return {};
}

export async function adminDeleteTerms(id: number): Promise<{ error?: Problem }> {
  await requireAdmin();
  const error = await termsChangeProblem(id);
  if (error) {
    return { error };
  }
  await db().update(terms).set({ deletedAt: new Date() }).where(changeable(id));
  return {};
}

export async function adminClientLogKeys(): Promise<string[]> {
  await requireAdmin();
  const rows = await db().selectDistinct({ name: clientLog.name }).from(clientLog).orderBy(asc(clientLog.name));
  return rows.map((row) => row.name);
}

// created_at is a TIMESTAMP, read in the session's time zone: convert_tz makes the days UTC.
export async function adminClientStats(key: string, measure: StatsMeasure, range: number) {
  await requireAdmin();
  const days = statsDays(range, new Date());
  const day = sql<string>`date_format(convert_tz(${clientLog.createdAt}, @@session.time_zone, '+00:00'), '%Y-%m-%d')`;
  const counted = measure === "addresses" ? clientLog.address : clientLog.connectionId;
  const rows = await db()
    .select({ day, value: clientLog.value, n: sql<number>`count(distinct ${counted})`.mapWith(Number) })
    .from(clientLog)
    .where(
      and(
        eq(clientLog.name, key),
        gte(clientLog.createdAt, sql`convert_tz(${`${days[0]} 00:00:00`}, '+00:00', @@session.time_zone)`),
      ),
    )
    .groupBy(day, clientLog.value);
  return shapeStats(rows, days);
}
