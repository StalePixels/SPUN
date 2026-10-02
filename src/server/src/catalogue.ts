// Each page size keeps the largest possible reply inside one 4096-byte block
// (test/codec.test.ts). An app's categories are capped for the same reason.
export const FIND_PAGE_SIZE = 20;
export const LIST_PAGE_SIZE = 20;
export const INFO_PAGE_SIZE = 64;
export const INFO_CATEGORIES_MAX = 16;

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
  downloads: number;
}

export interface Screenshot {
  slot: number;
  width: number;
}

export interface AppInfo {
  username: string;
  title: string;
  description: string;
  downloads: number;
  categories: string[];
  screenshots: Screenshot[];
}

export interface Release {
  serial: number;
  version: string;
  date: string;
}

export interface Changelog extends Release {
  changelog: string | null;
}

export interface Slice<T> {
  total: number;
  items: T[];
}

// Hides deleted apps and deleted releases. The latest release is the highest
// serial that is not deleted. find(), list() and app() show only apps that have one.
export interface Catalogue {
  find(text: string, offset: number, limit: number): Promise<Slice<FoundApp>>;
  list(offset: number, limit: number): Promise<Slice<FoundApp>>;
  app(id: AppId): Promise<AppInfo | null>;
  releases(id: AppId, offset: number, limit: number): Promise<Slice<Release>>;
  changelog(id: AppId, serial: number): Promise<Changelog | null>;
  countDownload(id: AppId): Promise<void>;
}

const APP_ID_RE = /^[0-9a-z]{6}$/;

export function parseAppId(value: string): AppId | null {
  const id = value.toLowerCase();
  return APP_ID_RE.test(id) ? (id as AppId) : null;
}

const ZIP_PATH_RE = /^[^/]+\/([0-9a-z]{6})-[0-9a-f]{4}\.zip$/i;

export function zipAppId(relativePath: string): AppId | null {
  const match = ZIP_PATH_RE.exec(relativePath);
  return match ? parseAppId(match[1]) : null;
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

// Serials start at 1 and fit a u16, as page numbers do.
export function parseSerial(value: string | undefined): number | null {
  return value === undefined ? null : parsePage(value);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}
