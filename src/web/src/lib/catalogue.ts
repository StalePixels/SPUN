import "server-only";
import { and, asc, desc, eq, exists, isNull, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { aliases, appCategories, apps, releases, savedApps, users } from "@/db/schema";
import { parseAppId, type AppId } from "./apps";
import { appCategoryList, appCategoryMap, liveCategories, liveCategory, type Category } from "./categories";
import { db } from "./db";
import { CATALOGUE_PAGE_SIZE } from "./rules";
import { appScreenshots, mainScreenshots, type Screenshot } from "./screenshots";

export type CatalogueRow = {
  id: AppId;
  title: string;
  username: string | null;
  version: string;
  releaseDate: string;
  downloads: number;
  categories: Category[];
  screenshot: Screenshot | null;
};

export type PublicApp = {
  id: AppId;
  title: string;
  description: string;
  username: string | null;
  downloads: number;
};

export type PublicRelease = { serial: number; version: string; releaseDate: string; changelog: string | null };

// The rule SPUNServer uses (src/server/src/mysqlCatalogue.ts): not deleted, and
// at least one live release.
function isPublic() {
  const live = alias(releases, "live");
  return and(
    isNull(apps.deletedAt),
    exists(
      db()
        .select({ one: sql`1` })
        .from(live)
        .where(and(eq(live.appId, apps.id), isNull(live.deletedAt))),
    ),
  );
}

function latestSerial() {
  const latest = alias(releases, "latest");
  return sql`(${db()
    .select({ serial: max(latest.serial) })
    .from(latest)
    .where(and(eq(latest.appId, apps.id), isNull(latest.deletedAt)))})`;
}

function inCategory(categoryId: number) {
  return exists(
    db()
      .select({ one: sql`1` })
      .from(appCategories)
      .where(and(eq(appCategories.appId, apps.id), eq(appCategories.categoryId, categoryId))),
  );
}

function likePattern(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

// A copy of SPUNServer's FIND rule (src/server/src/mysqlCatalogue.ts), so the
// web and the Next find the same apps for the same text.
function matches(query: string) {
  const pattern = likePattern(query);
  return or(sql`lower(${apps.title}) like ${pattern}`, sql`lower(${apps.description}) like ${pattern}`);
}

async function withDetails(rows: Omit<CatalogueRow, "categories" | "screenshot">[]): Promise<CatalogueRow[]> {
  const ids = rows.map((row) => row.id);
  const categories = await appCategoryMap(ids);
  const screenshots = await mainScreenshots(ids);
  return rows.map((row) => ({
    ...row,
    categories: categories.get(row.id) ?? [],
    screenshot: screenshots.get(row.id) ?? null,
  }));
}

// One row more than a page, so the caller knows if there is a next page.
export async function cataloguePage(
  page: number,
  categoryId: number | null,
  query: string,
): Promise<{ rows: CatalogueRow[]; more: boolean }> {
  const rows = await db()
    .select({
      id: apps.id,
      title: apps.title,
      username: users.username,
      version: releases.version,
      releaseDate: releases.releaseDate,
      downloads: apps.downloads,
    })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .innerJoin(releases, and(eq(releases.appId, apps.id), eq(releases.serial, latestSerial())))
    .where(
      and(
        isPublic(),
        categoryId === null ? undefined : inCategory(categoryId),
        query === "" ? undefined : matches(query),
      ),
    )
    .orderBy(asc(apps.title), asc(apps.id))
    .limit(CATALOGUE_PAGE_SIZE + 1)
    .offset((page - 1) * CATALOGUE_PAGE_SIZE);
  const shown = rows.slice(0, CATALOGUE_PAGE_SIZE);
  return { rows: await withDetails(shown), more: rows.length > CATALOGUE_PAGE_SIZE };
}

export async function ownAppRows(userId: string): Promise<{ id: AppId; title: string }[]> {
  return db()
    .select({ id: apps.id, title: apps.title })
    .from(apps)
    .where(and(eq(apps.userId, userId), isNull(apps.deletedAt)))
    .orderBy(asc(apps.title));
}

// Newest save first. A saved app that is not public is left out, but its row
// stays, so it comes back if the app is restored.
export async function savedAppRows(userId: string): Promise<CatalogueRow[]> {
  const rows = await db()
    .select({
      id: apps.id,
      title: apps.title,
      username: users.username,
      version: releases.version,
      releaseDate: releases.releaseDate,
      downloads: apps.downloads,
    })
    .from(savedApps)
    .innerJoin(apps, eq(apps.id, savedApps.appId))
    .innerJoin(users, eq(users.id, apps.userId))
    .innerJoin(releases, and(eq(releases.appId, apps.id), eq(releases.serial, latestSerial())))
    .where(and(eq(savedApps.userId, userId), isPublic()))
    .orderBy(desc(savedApps.createdAt), asc(apps.title), asc(apps.id));
  return withDetails(rows);
}

export async function publicApp(id: AppId): Promise<PublicApp | null> {
  const [app] = await db()
    .select({
      id: apps.id,
      title: apps.title,
      description: apps.description,
      username: users.username,
      downloads: apps.downloads,
    })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(and(eq(apps.id, id), isPublic()));
  return app ?? null;
}

// An app id or an alias, as `.spun get` takes them: both share one namespace.
export async function publicAppIdByName(name: string): Promise<AppId | null> {
  const id = parseAppId(name);
  if (id && (await publicApp(id))) {
    return id;
  }
  return publicAppIdByAlias(name);
}

// The alias column's collation ignores case.
export async function publicAppIdByAlias(name: string): Promise<AppId | null> {
  const [row] = await db()
    .select({ id: apps.id })
    .from(aliases)
    .innerJoin(apps, eq(apps.id, aliases.appId))
    .where(and(eq(aliases.alias, name), isPublic()));
  return row?.id ?? null;
}

// Latest first.
export async function liveReleases(id: AppId): Promise<PublicRelease[]> {
  return db()
    .select({
      serial: releases.serial,
      version: releases.version,
      releaseDate: releases.releaseDate,
      changelog: releases.changelog,
    })
    .from(releases)
    .where(and(eq(releases.appId, id), isNull(releases.deletedAt)))
    .orderBy(desc(releases.serial));
}

export type CatalogueView = {
  category: Category | null;
  categories: Category[];
  rows: CatalogueRow[];
  more: boolean;
};

// For the HTML and the Markdown catalogue. Null for an unknown or deleted slug.
export async function catalogueView(slug: string | null, page: number, query: string): Promise<CatalogueView | null> {
  const category = slug === null ? null : await liveCategory(slug);
  if (slug !== null && !category) {
    return null;
  }
  const categories = await liveCategories();
  const { rows, more } = await cataloguePage(page, category?.id ?? null, query);
  return { category, categories, rows, more };
}

export type AppView = { app: PublicApp; releases: PublicRelease[]; categories: Category[]; screenshots: Screenshot[] };

// For the HTML and the Markdown app page. Null if the app is not public.
export async function appView(rawId: string): Promise<AppView | null> {
  const id = parseAppId(rawId);
  const app = id ? await publicApp(id) : null;
  if (!id || !app) {
    return null;
  }
  const releases = await liveReleases(id);
  if (releases.length === 0) {
    return null;
  }
  return { app, releases, categories: await appCategoryList(id), screenshots: await appScreenshots(id) };
}
