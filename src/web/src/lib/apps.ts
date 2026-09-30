import { customAlphabet } from "nanoid";

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
