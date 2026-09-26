import mysql, { type RowDataPacket } from "mysql2/promise";
import { settings } from "./settings";

// Direct database reads, to check what the CMS stored. The only writes are
// the restores of settings a test changed.

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
  const [row] = await query<{ id: string; title: string; deleted_at: Date | null }>(
    "select id, title, deleted_at from apps where id = ?",
    [appId],
  );
  return row;
}

export async function releaseRow(appId: string, serial: number) {
  const [row] = await query<{ version: string; release_date: string; deleted_at: Date | null }>(
    "select version, date_format(release_date, '%Y-%m-%d') as release_date, deleted_at from releases where app_id = ? and serial = ?",
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
