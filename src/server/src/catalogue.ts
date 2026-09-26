export const FIND_PAGE_SIZE = 20;
export const INFO_PAGE_SIZE = 100;

// Always lowercase: an AppId only comes from parseAppId.
export type AppId = string & { readonly __brand: "AppId" };

export interface Latest {
  serial: number;
  version: string;
}

export interface FoundApp {
  id: AppId;
  username: string;
  title: string;
  latest: Latest;
}

export interface AppInfo {
  username: string;
  title: string;
  description: string;
}

export interface Release {
  serial: number;
  version: string;
  date: string;
}

export interface Slice<T> {
  total: number;
  items: T[];
}

// Hides deleted apps and deleted releases. The latest release is the highest
// serial that is not deleted. find() lists only apps that have one.
export interface Catalogue {
  find(text: string, offset: number, limit: number): Promise<Slice<FoundApp>>;
  app(id: AppId): Promise<AppInfo | null>;
  releases(id: AppId, offset: number, limit: number): Promise<Slice<Release>>;
}

const APP_ID_RE = /^[0-9a-z]{6}$/;

export function parseAppId(value: string): AppId | null {
  const id = value.toLowerCase();
  return APP_ID_RE.test(id) ? (id as AppId) : null;
}

export function parsePage(value: string | undefined): number | null {
  if (value === undefined) {
    return 1;
  }
  if (!/^[1-9][0-9]{0,4}$/.test(value)) {
    return null;
  }
  const page = Number(value);
  return page <= 0xffff ? page : null;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}
