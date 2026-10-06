import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { appCategories, categories } from "@/db/schema";
import type { AppId } from "./apps";
import type { PathCategory } from "./rules";
import { db } from "./db";

export type Category = { id: number; slug: string; name: string };

export type LiveCategory = Category & PathCategory;

export async function liveCategories(): Promise<LiveCategory[]> {
  return db()
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      installDir: categories.installDir,
      specificity: categories.specificity,
    })
    .from(categories)
    .where(isNull(categories.deletedAt))
    .orderBy(asc(categories.name), asc(categories.id));
}

// Exact match only: the column's collation ignores case and accents.
export async function liveCategory(slug: string): Promise<Category | null> {
  if (!/^[a-z0-9-]{1,16}$/.test(slug)) {
    return null;
  }
  const [row] = await db()
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(and(eq(categories.slug, slug), isNull(categories.deletedAt)));
  return row?.slug === slug ? row : null;
}

export async function appCategoryMap(appIds: AppId[]): Promise<Map<AppId, Category[]>> {
  const map = new Map<AppId, Category[]>();
  if (appIds.length === 0) {
    return map;
  }
  const rows = await db()
    .select({ appId: appCategories.appId, id: categories.id, slug: categories.slug, name: categories.name })
    .from(appCategories)
    .innerJoin(categories, eq(categories.id, appCategories.categoryId))
    .where(and(inArray(appCategories.appId, appIds), isNull(categories.deletedAt)))
    .orderBy(asc(categories.name), asc(categories.id));
  for (const { appId, ...category } of rows) {
    map.set(appId, [...(map.get(appId) ?? []), category]);
  }
  return map;
}

export async function appCategoryList(appId: AppId): Promise<Category[]> {
  return (await appCategoryMap([appId])).get(appId) ?? [];
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

// Links to deleted categories stay, so a restore brings them back.
export async function setAppCategories(tx: Tx, appId: AppId, ids: number[]): Promise<void> {
  const live = await tx.select({ id: categories.id }).from(categories).where(isNull(categories.deletedAt));
  const liveIds = live.map((row) => row.id);
  if (liveIds.length > 0) {
    await tx
      .delete(appCategories)
      .where(and(eq(appCategories.appId, appId), inArray(appCategories.categoryId, liveIds)));
  }
  if (ids.length > 0) {
    await tx.insert(appCategories).values(ids.map((categoryId) => ({ appId, categoryId })));
  }
}
