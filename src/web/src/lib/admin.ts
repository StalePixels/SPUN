import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { apps, releases, settings, users } from "@/db/schema";
import { db } from "./db";
import type { Problem } from "./problems";
import { currentUser, isAdmin } from "./session";
import { DEFAULT_APP_LIMIT, getSetting } from "./settings";

// Every export calls requireAdmin() itself. Only src/app/admin/ may import this.

// A 404, so /admin looks absent to non-admins.
export async function requireAdmin(): Promise<{ id: string; username: string }> {
  const user = await currentUser();
  if (!user?.username || !(await isAdmin(user.id))) {
    notFound();
  }
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
    })
    .from(users)
    .where(eq(users.id, userId));
  return user;
}

// Refuses to remove the last admin.
export async function adminUpdateUser(
  userId: string,
  changes: { appLimit: number | null; isAdmin: boolean },
): Promise<{ error?: Problem }> {
  await requireAdmin();
  if (!changes.isAdmin && (await isAdmin(userId))) {
    const [row] = await db().select({ n: count() }).from(users).where(eq(users.isAdmin, true));
    if ((row?.n ?? 0) <= 1) {
      return { error: { code: "admin.lastAdmin" } };
    }
  }
  await db().update(users).set(changes).where(eq(users.id, userId));
  return {};
}
