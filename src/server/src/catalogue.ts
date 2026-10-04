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
  id: AppId;
  username: string;
  title: string;
  description: string;
  downloads: number;
  categories: string[];
  screenshots: Screenshot[];
  installDir: string | null;
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
// resolve() gives the id that an app id or an alias names, deleted or not; an alias
// can move to another app at any time, so the server resolves on every request.
export interface Catalogue {
  resolve(name: AppName): Promise<AppId | null>;
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

// An app id or an alias, as a client sends it. Ids and aliases share one name pool (the CMS's
// rules.ts: an alias is 1-16 of a-z, 0-9, "_" and "-"). Always lowercase
export type AppName = string & { readonly __brand: "AppName" };

const APP_NAME_RE = /^[0-9a-z_-]{1,16}$/;

export function parseAppName(value: string): AppName | null {
  const name = value.toLowerCase();
  return APP_NAME_RE.test(name) ? (name as AppName) : null;
}

// The paths of the files a client asks for by app: a zip, a thumbnail and an NXI screenshot
const NAMED_FILE_RES = [
  /^([^/]+\/)([0-9a-z_-]{1,16})(-[0-9a-f]{4}\.zip)$/i,
  /^([^/]+\/(?:thumb|nxi)\/)([0-9a-z_-]{1,16})(\/[^/]+)$/i,
];

// Splits a relative file path into the part before the app's name, the name and the part after
export function namedFile(relativePath: string): [string, AppName, string] | null {
  for (const re of NAMED_FILE_RES) {
    const match = re.exec(relativePath);
    const name = match ? parseAppName(match[2]) : null;
    if (match && name) return [match[1], name, match[3]];
  }
  return null;
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
