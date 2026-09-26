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

export interface AppDeleteStore {
  markDeleted(appId: AppId): Promise<void>;
  releaseFilePaths(appId: AppId): Promise<string[]>;
  removeFile(path: string): Promise<void>;
}

export async function deleteApp(store: AppDeleteStore, appId: AppId): Promise<void> {
  await store.markDeleted(appId);
  for (const path of await store.releaseFilePaths(appId)) {
    await store.removeFile(path);
  }
}
