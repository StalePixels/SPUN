import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import path from "node:path";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { settings } from "./settings";

// Direct database reads, to check what the CMS stored. The writes are the
// restores of settings a test changed, the users and apps that the admin
// tests make for themselves (so no real account is renamed or disabled), and
// the app row of the setup's test app.

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = await mysql.createConnection(settings.databaseUrl);
  try {
    const [rows] = await connection.query<RowDataPacket[]>(sql, params);
    return rows as T[];
  } finally {
    await connection.end();
  }
}

export async function appRow(appId: string) {
  const [row] = await query<{ id: string; user_id: string; title: string; deleted_at: Date | null }>(
    "select id, user_id, title, deleted_at from apps where id = ?",
    [appId],
  );
  return row;
}

export async function releaseRow(appId: string, serial: number) {
  const [row] = await query<{ version: string; release_date: string; changelog: string | null; deleted_at: Date | null }>(
    "select version, date_format(release_date, '%Y-%m-%d') as release_date, changelog, deleted_at from releases where app_id = ? and serial = ?",
    [appId, serial],
  );
  return row;
}

export async function userByUsername(username: string) {
  const [row] = await query<{ id: string; is_admin: number; app_limit: number | null }>(
    "select id, is_admin, app_limit from users where username = ?",
    [username],
  );
  if (!row) throw new Error(`No user ${username} in the database.`);
  return row;
}

export async function setUserAppLimit(userId: string, limit: number | null): Promise<void> {
  await query("update users set app_limit = ? where id = ?", [limit, userId]);
}

export async function defaultAppLimit(): Promise<string | null> {
  const [row] = await query<{ value: string | null }>(
    "select value from settings where slug = 'default_app_limit'",
  );
  if (!row) throw new Error("No default_app_limit row in the settings table.");
  return row.value;
}

export async function setDefaultAppLimit(value: string | null): Promise<void> {
  await query("update settings set value = ? where slug = 'default_app_limit'", [value]);
}

export async function userRow(userId: string) {
  const [row] = await query<{ username: string | null; disabled_at: Date | null }>(
    "select username, disabled_at from users where id = ?",
    [userId],
  );
  return row;
}

export async function insertUser(username: string | null): Promise<string> {
  const id = randomUUID();
  await query("insert into users (id, name, username) values (?, ?, ?)", [id, "E2E test user", username]);
  return id;
}

export async function insertApp(userId: string, title: string, description = ""): Promise<string> {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const id = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join("");
  return insertAppWithId(id, userId, title, description);
}

// For the test app of the setup, whose id is fixed in .env.e2e.
export async function insertAppWithId(id: string, userId: string, title: string, description = ""): Promise<string> {
  await query("insert into apps (id, user_id, title, description) values (?, ?, ?, ?)", [
    id,
    userId,
    title,
    description,
  ]);
  return id;
}

// Only on an app that the test made.
export async function setAppDownloads(appId: string, downloads: number): Promise<void> {
  await query("update apps set downloads = ? where id = ?", [downloads, appId]);
}

export async function markAppDeleted(appId: string): Promise<void> {
  await query("update apps set deleted_at = now() where id = ?", [appId]);
}

// Returns the session token: as the Auth.js session cookie it logs the browser in.
export async function insertSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await query("insert into sessions (session_token, user_id, expires) values (?, ?, ?)", [token, userId, expires]);
  return token;
}

export async function sessionCount(userId: string): Promise<number> {
  const [row] = await query<{ n: number }>("select count(*) as n from sessions where user_id = ?", [userId]);
  return Number(row?.n ?? 0);
}

export async function appIdsOf(userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>("select id from apps where user_id = ?", [userId]);
  return rows.map((row) => row.id);
}

// The CMS makes these folders on the first screenshot; a test leaves none behind.
function removeIfEmpty(dir: string): void {
  if (existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
}

function removeFilesOf(dir: string, appId: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${appId}-`)) {
      rmSync(path.join(dir, name), { force: true });
    }
  }
}

// Removes apps that a test made, outright: the rows that point at each app, the
// app row, and its files in the data directory, the bin and the assets. A test
// run then leaves nothing behind, deleted rows included.
export async function removeApps(appIds: string[]): Promise<void> {
  if (appIds.length === 0) return;
  const owners = await query<{ id: string; username: string | null }>(
    "select apps.id, users.username from apps join users on users.id = apps.user_id where apps.id in (?)",
    [appIds],
  );
  for (const table of ["app_categories", "saved_apps", "screenshots", "releases"]) {
    await query(`delete from ${table} where app_id in (?)`, [appIds]);
  }
  await query("delete from apps where id in (?)", [appIds]);
  for (const appId of appIds) {
    const username = owners.find((row) => row.id === appId)?.username;
    if (username) {
      removeFilesOf(path.join(settings.dataDir, username), appId);
      for (const dir of ["nxi", "thumb"]) {
        rmSync(path.join(settings.dataDir, username, dir, appId), { recursive: true, force: true });
        removeIfEmpty(path.join(settings.dataDir, username, dir));
      }
    }
    removeFilesOf(settings.binDir, appId);
    rmSync(path.join(settings.assetDir, "screenshots", appId), { recursive: true, force: true });
    removeIfEmpty(path.join(settings.assetDir, "screenshots"));
  }
}

// Removes a user that a test inserted, with their apps and sessions.
export async function removeTestUser(userId: string): Promise<void> {
  await removeApps(await appIdsOf(userId));
  await query("delete from sessions where user_id = ?", [userId]);
  await query("delete from users where id = ?", [userId]);
}

// A release row only, with no zip: enough for the catalogue and the app page.
export async function insertRelease(appId: string, serial: number, version: string): Promise<void> {
  await query("insert into releases (app_id, serial, version, release_date) values (?, ?, ?, curdate())", [
    appId,
    serial,
    version,
  ]);
}

export type CategoryRow = { id: number; slug: string; name: string; deleted_at: Date | null };

export async function categoryBySlug(slug: string): Promise<CategoryRow | undefined> {
  const [row] = await query<CategoryRow>("select id, slug, name, deleted_at from categories where slug = ?", [slug]);
  return row;
}

export async function firstLiveCategoryId(): Promise<number> {
  const [row] = await query<{ id: number }>("select id from categories where deleted_at is null order by id limit 1");
  if (!row) throw new Error("No live category in the database. Add one in /admin/categories.");
  return row.id;
}

export async function insertCategory(slug: string, name: string): Promise<number> {
  const connection = await mysql.createConnection(settings.databaseUrl);
  try {
    const [result] = await connection.query<ResultSetHeader>("insert into categories (slug, name) values (?, ?)", [
      slug,
      name,
    ]);
    return result.insertId;
  } finally {
    await connection.end();
  }
}

export async function linkCategory(appId: string, categoryId: number): Promise<void> {
  await query("insert into app_categories (app_id, category_id) values (?, ?)", [appId, categoryId]);
}

export async function appCategoryIds(appId: string): Promise<number[]> {
  const rows = await query<{ category_id: number }>(
    "select category_id from app_categories where app_id = ? order by category_id",
    [appId],
  );
  return rows.map((row) => row.category_id);
}

// The public apps in a category, by the rule the catalogue uses.
export async function publicAppIdsIn(categoryId: number): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select a.id from apps a join app_categories ac on ac.app_id = a.id
     where ac.category_id = ? and a.deleted_at is null
       and exists (select 1 from releases r where r.app_id = a.id and r.deleted_at is null)`,
    [categoryId],
  );
  return rows.map((row) => row.id);
}

export async function markCategoryDeleted(id: number): Promise<void> {
  await query("update categories set deleted_at = now() where id = ?", [id]);
}

export async function liveCategorySlugs(): Promise<string[]> {
  const rows = await query<{ slug: string }>("select slug from categories where deleted_at is null");
  return rows.map((row) => row.slug);
}

// Removes categories that a test made, with their app links.
export async function removeCategories(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await query("delete from app_categories where category_id in (?)", [ids]);
  await query("delete from categories where id in (?)", [ids]);
}

export async function screenshotRows(appId: string) {
  return query<{ slot: number; width: number; updated_at: Date }>(
    "select slot, width, updated_at from screenshots where app_id = ? order by slot",
    [appId],
  );
}

export async function isSaved(userId: string, appId: string): Promise<boolean> {
  const rows = await query("select 1 from saved_apps where user_id = ? and app_id = ?", [userId, appId]);
  return rows.length === 1;
}

export async function apiKeyRow(keyId: string) {
  const [row] = await query<{ user_id: string; name: string; deleted_at: Date | null }>(
    "select user_id, name, deleted_at from api_keys where id = ?",
    [keyId],
  );
  return row;
}

export async function liveAppIdsOf(userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    "select id from apps where user_id = ? and deleted_at is null order by title",
    [userId],
  );
  return rows.map((row) => row.id);
}
