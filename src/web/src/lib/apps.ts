import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { apps, releases } from "@/db/schema";
import { appCategoryList, liveCategories, setAppCategories } from "./categories";
import { db } from "./db";
import { appCount, appLimit } from "./limits";
import type { Problem } from "./problems";
import { appBinStore } from "./releases";
import {
  canCreateApp,
  checkCategoryChoice,
  checkDescription,
  checkTitle,
  isoDay,
  type CategoryChoice,
} from "./rules";
import { appScreenshots, type Screenshot } from "./screenshots";

export const APP_ID_LENGTH = 6;

// Always lowercase: an AppId only comes from parseAppId or the generator.
export type AppId = string & { readonly __brand: "AppId" };

const APP_ID_RE = /^[0-9a-z]{6}$/;
const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", APP_ID_LENGTH);

export function parseAppId(value: string): AppId | null {
  const id = value.toLowerCase();
  return APP_ID_RE.test(id) ? (id as AppId) : null;
}

function newAppId(): AppId {
  return generateId() as AppId;
}

export interface AppIdStore {
  // Must count deleted apps too: a deleted app keeps its id.
  idExists(id: AppId): Promise<boolean>;
}

export async function allocateAppId(
  store: AppIdStore,
  generate: () => AppId = newAppId,
): Promise<AppId> {
  for (;;) {
    const id = generate();
    if (!(await store.idExists(id))) {
      return id;
    }
  }
}

// The zips of an app are in DATA_DIR only while the app and the release are
// both live; otherwise they are in the bin. Screenshots go with the app.
export interface AppBinStore {
  markDeleted(appId: AppId): Promise<void>;
  clearDeleted(appId: AppId): Promise<void>;
  // Releases that are not deleted on their own.
  liveSerials(appId: AppId): Promise<number[]>;
  binRelease(appId: AppId, serial: number): Promise<void>;
  unbinRelease(appId: AppId, serial: number): Promise<void>;
  binScreenshots(appId: AppId): Promise<void>;
  unbinScreenshots(appId: AppId): Promise<void>;
}

export async function deleteApp(store: AppBinStore, appId: AppId): Promise<void> {
  await store.markDeleted(appId);
  for (const serial of await store.liveSerials(appId)) {
    await store.binRelease(appId, serial);
  }
  await store.binScreenshots(appId);
}

export async function restoreApp(store: AppBinStore, appId: AppId): Promise<void> {
  for (const serial of await store.liveSerials(appId)) {
    await store.unbinRelease(appId, serial);
  }
  await store.unbinScreenshots(appId);
  await store.clearDeleted(appId);
}

export interface AppMoveStore {
  moveRelease(serial: number, from: string, to: string): Promise<void>;
  moveScreenshots(from: string, to: string): Promise<void>;
  updateOwner(appId: AppId, userId: string): Promise<void>;
}

// Files first, then the row. If anything fails, the files that moved go back.
export async function moveApp(
  store: AppMoveStore,
  appId: AppId,
  serials: number[],
  move: { from: string; to: string; userId: string },
): Promise<void> {
  const moved: number[] = [];
  let screenshots = false;
  try {
    for (const serial of serials) {
      await store.moveRelease(serial, move.from, move.to);
      moved.push(serial);
    }
    await store.moveScreenshots(move.from, move.to);
    screenshots = true;
    await store.updateOwner(appId, move.userId);
  } catch (err) {
    if (screenshots) {
      await store.moveScreenshots(move.to, move.from);
    }
    for (const serial of moved) {
      await store.moveRelease(serial, move.to, move.from);
    }
    throw err;
  }
}

export type AppFields = { title: string; description: string; categories: number[] };

export type OwnRelease = {
  serial: number;
  version: string;
  releaseDate: string;
  deletedDay: string | null;
};

export type OwnAppView = {
  id: AppId;
  title: string;
  description: string;
  categories: number[];
  releases: OwnRelease[];
  screenshots: Screenshot[];
};

export async function ownedApp(userId: string, appId: AppId) {
  const rows = await db()
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.userId, userId), isNull(apps.deletedAt)));
  return rows[0];
}

async function checkAppFields(fields: AppFields): Promise<CategoryChoice> {
  const error = checkTitle(fields.title) ?? checkDescription(fields.description);
  if (error) {
    return { ok: false, error };
  }
  return checkCategoryChoice(fields.categories, (await liveCategories()).map((category) => category.id));
}

export async function addApp(userId: string, fields: AppFields): Promise<{ error: Problem } | { id: AppId }> {
  const choice = await checkAppFields(fields);
  if (!choice.ok) {
    return { error: choice.error };
  }
  const limit = await appLimit(userId);
  if (!canCreateApp(await appCount(userId), limit)) {
    return { error: { code: "app.limitReached", limit } };
  }
  const id = await allocateAppId({
    async idExists(candidate) {
      const rows = await db().select({ id: apps.id }).from(apps).where(eq(apps.id, candidate));
      return rows.length > 0;
    },
  });
  await db().transaction(async (tx) => {
    await tx.insert(apps).values({ id, userId, title: fields.title, description: fields.description });
    await setAppCategories(tx, id, choice.ids);
  });
  return { id };
}

export async function editApp(
  userId: string,
  appId: AppId,
  readFields: () => Promise<AppFields>,
): Promise<{ error?: Problem }> {
  if (!(await ownedApp(userId, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const fields = await readFields();
  const choice = await checkAppFields(fields);
  if (!choice.ok) {
    return { error: choice.error };
  }
  await db().transaction(async (tx) => {
    await tx.update(apps).set({ title: fields.title, description: fields.description }).where(eq(apps.id, appId));
    await setAppCategories(tx, appId, choice.ids);
  });
  return {};
}

export async function deleteOwnApp(user: { id: string; username: string }, appId: AppId): Promise<{ error?: Problem }> {
  if (!(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  await deleteApp(appBinStore(user.username), appId);
  return {};
}

export async function ownAppView(userId: string, appId: AppId): Promise<OwnAppView | null> {
  const app = await ownedApp(userId, appId);
  if (!app) {
    return null;
  }
  const rows = await db()
    .select()
    .from(releases)
    .where(eq(releases.appId, appId))
    .orderBy(desc(releases.serial));
  return {
    id: appId,
    title: app.title,
    description: app.description,
    categories: (await appCategoryList(appId)).map((category) => category.id),
    releases: rows.map((row) => ({
      serial: row.serial,
      version: row.version,
      releaseDate: row.releaseDate,
      deletedDay: row.deletedAt ? isoDay(row.deletedAt) : null,
    })),
    screenshots: await appScreenshots(appId),
  };
}
