import type { Problem } from "./problems";

export const USERNAME_MAX = 16;
export const USERNAME_UI_MIN = 8;
export const VERSION_MAX = 16;
export const TITLE_MAX = 32;
export const DESCRIPTION_MAX = 256;
export const CHANGELOG_MAX = 1024;
export const SERIAL_MAX = 0xffff;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_TEXT = "4 MB";
export const MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
export const MAX_UNPACKED_TEXT = "16 MB";
export const SCREENSHOT_SLOTS = 5;
export const MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024;
export const MAX_SCREENSHOT_TEXT = "16 MB";
export const MAX_IMAGE_PIXELS = 4_000_000;
export const MAX_IMAGE_PIXELS_TEXT = "4 megapixels";

// API defaults, for production. A value of the same name in .env overrides each.
export const API_JSON_BODY_MAX = 64 * 1024;
export const API_RELEASE_BODY_MAX = MAX_UPLOAD_BYTES + 64 * 1024;
export const API_SCREENSHOT_BODY_MAX = MAX_SCREENSHOT_BYTES + 64 * 1024;
export const API_IP_PER_MINUTE = 60;
export const API_KEY_PER_MINUTE = 60;
export const UPLOADS_PER_HOUR = 20;
export const API_REQUEST_WINDOW_SECONDS = 5 * 60;
export const KEY_NAME_MAX = TITLE_MAX;

const SLUG_CHAR = /[A-Za-z0-9_-]/;
const VERSION_CHAR = /[A-Za-z0-9_.,#-]/;
const PRINTABLE_ASCII_CHAR = /[\x20-\x7e]/;
const CHANGELOG_CHAR = /[\x20-\x7e\n]/;
const SLUG_RE = /^[A-Za-z0-9_-]+$/;

export function invalidCharacters(value: string, allowed: RegExp): string[] {
  return [...new Set(Array.from(value).filter((char) => !allowed.test(char)))];
}

// Also holds for usernames an admin inserts by hand.
export function isValidSlug(value: string): boolean {
  return value.length >= 1 && value.length <= USERNAME_MAX && SLUG_RE.test(value);
}

// UI-only minimum, so short names stay free for system use.
export function checkUsernameInput(value: string): Problem | null {
  const bad = invalidCharacters(value, SLUG_CHAR);
  if (bad.length > 0) {
    return { code: "username.invalidCharacters", chars: bad };
  }
  if (value.length < USERNAME_UI_MIN || value.length > USERNAME_MAX) {
    return { code: "username.length", min: USERNAME_UI_MIN, max: USERNAME_MAX };
  }
  return null;
}

export function usernameKey(value: string): string {
  return value.toLowerCase();
}

export function checkVersion(value: string): Problem | null {
  if (value.length < 1 || value.length > VERSION_MAX) {
    return { code: "version.length", min: 1, max: VERSION_MAX };
  }
  const bad = invalidCharacters(value, VERSION_CHAR);
  if (bad.length > 0) {
    return { code: "version.invalidCharacters", chars: bad };
  }
  return null;
}

// Case-insensitive, as the database's unique key on (app_id, version) is.
export function checkVersionUnused(value: string, existing: string[]): Problem | null {
  const key = value.toLowerCase();
  return existing.some((version) => version.toLowerCase() === key) ? { code: "version.taken" } : null;
}

export function checkTitle(value: string): Problem | null {
  if (value.length < 1 || value.length > TITLE_MAX) {
    return { code: "title.length", min: 1, max: TITLE_MAX };
  }
  const bad = invalidCharacters(value, PRINTABLE_ASCII_CHAR);
  if (bad.length > 0) {
    return { code: "title.invalidCharacters", chars: bad };
  }
  return null;
}

export function checkKeyName(value: string): Problem | null {
  const error = checkTitle(value);
  if (!error) {
    return null;
  }
  return { ...error, code: error.code === "title.length" ? "keyName.length" : "keyName.invalidCharacters" };
}

export function checkDescription(value: string): Problem | null {
  if (value.length > DESCRIPTION_MAX) {
    return { code: "description.length", max: DESCRIPTION_MAX };
  }
  const bad = invalidCharacters(value, PRINTABLE_ASCII_CHAR);
  if (bad.length > 0) {
    return { code: "description.invalidCharacters", chars: bad };
  }
  return null;
}

export type ChangelogCheck = { ok: true; changelog: string | null } | { ok: false; error: Problem };

// A browser sends CR LF from a textarea; the stored text uses LF only.
export function checkChangelog(input: string): ChangelogCheck {
  const value = input.replace(/\r\n/g, "\n");
  const bad = invalidCharacters(value, CHANGELOG_CHAR);
  if (bad.length > 0) {
    return { ok: false, error: { code: "changelog.invalidCharacters", chars: bad } };
  }
  if (value.length > CHANGELOG_MAX) {
    return { ok: false, error: { code: "changelog.length", max: CHANGELOG_MAX } };
  }
  return { ok: true, changelog: value === "" ? null : value };
}

export const INSTALL_DIR_MAX = 64;
export const INSTALL_DIR_BANNED = ["/", "/nextzxos", "/sys", "/dot", "/machines"];

// "~" makes 8.3 aliases such as NEXTZX~1.
const INSTALL_DIR_CHAR = /(?!["*:<>?|~])[\x20-\x7e]/;

export type InstallDirCheck = { ok: true; installDir: string | null } | { ok: false; error: Problem };

// FAT ignores case, so a banned directory is banned in any case, with all
// that is under it; "/" is banned only by itself. FAT also drops a dot or a
// space at the end of a part, so "/dot." would be "/dot".
export function checkInstallDir(input: string): InstallDirCheck {
  const value = input.trim();
  if (value === "") {
    return { ok: true, installDir: null };
  }
  if (value.includes(":")) {
    return { ok: false, error: { code: "installDir.drive" } };
  }
  const bad = invalidCharacters(value, INSTALL_DIR_CHAR);
  if (bad.length > 0) {
    return { ok: false, error: { code: "installDir.invalidCharacters", chars: bad } };
  }
  const parts = value.replace(/\\/g, "/").split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === "..")) {
    return { ok: false, error: { code: "installDir.dots" } };
  }
  if (parts.some((part) => /[. ]$/.test(part))) {
    return { ok: false, error: { code: "installDir.partEnd" } };
  }
  const installDir = `/${parts.join("/")}`;
  const key = installDir.toLowerCase();
  if (INSTALL_DIR_BANNED.some((banned) => key === banned || (banned !== "/" && key.startsWith(`${banned}/`)))) {
    return { ok: false, error: { code: "installDir.banned" } };
  }
  if (installDir.length > INSTALL_DIR_MAX) {
    return { ok: false, error: { code: "installDir.length", max: INSTALL_DIR_MAX } };
  }
  return { ok: true, installDir };
}

export const ALIAS_MAX = 16;

const ALIAS_CHAR = /[a-z0-9_-]/;

export type AliasCheck = { ok: true; alias: string } | { ok: false; error: Problem };

export const FEATURED = "featured";

// Computed on every read, never a row in aliases; also kept off category slugs.
export const RESERVED_ALIASES = [FEATURED];

export function checkAlias(input: string): AliasCheck {
  const alias = input.toLowerCase();
  const bad = invalidCharacters(alias, ALIAS_CHAR);
  if (bad.length > 0) {
    return { ok: false, error: { code: "alias.invalidCharacters", chars: bad } };
  }
  if (alias.length < 1 || alias.length > ALIAS_MAX) {
    return { ok: false, error: { code: "alias.length", min: 1, max: ALIAS_MAX } };
  }
  if (RESERVED_ALIASES.includes(alias)) {
    return { ok: false, error: { code: "alias.reserved" } };
  }
  return { ok: true, alias };
}

export const CATEGORY_SLUG_MAX = 16;
export const CATEGORY_NAME_MAX = 32;

const CATEGORY_SLUG_CHAR = /[a-z0-9-]/;

// Every top-level path of the site except apps, which is also a category, plus
// index, whose .md copy is /index.md. Old category URLs, /<slug>, still redirect.
export const RESERVED_PATHS = [
  "admin",
  "api",
  "catalog",
  "catalogue",
  "get",
  "index",
  "keys",
  "llms.txt",
  "md",
  "me",
  "my",
  "publish",
  "username",
];

// The form of an app id. A category slug may not have it: /catalogue/<x> is either.
export const APP_ID_RE = /^[0-9a-z]{6}$/;

export function checkCategorySlug(value: string): Problem | null {
  if (RESERVED_PATHS.includes(value) || RESERVED_ALIASES.includes(value)) {
    return { code: "category.reserved" };
  }
  const bad = invalidCharacters(value, CATEGORY_SLUG_CHAR);
  if (bad.length > 0) {
    return { code: "category.invalidCharacters", chars: bad };
  }
  if (value.length < 1 || value.length > CATEGORY_SLUG_MAX) {
    return { code: "category.length", min: 1, max: CATEGORY_SLUG_MAX };
  }
  if (APP_ID_RE.test(value)) {
    return { code: "category.appIdForm" };
  }
  return null;
}

export function checkCategoryName(value: string): Problem | null {
  if (value.length < 1 || value.length > CATEGORY_NAME_MAX) {
    return { code: "category.length", min: 1, max: CATEGORY_NAME_MAX };
  }
  const bad = invalidCharacters(value, PRINTABLE_ASCII_CHAR);
  if (bad.length > 0) {
    return { code: "category.invalidCharacters", chars: bad };
  }
  return null;
}

export type CategoryChoice = { ok: true; ids: number[] } | { ok: false; error: Problem };

// Only live categories count; an app needs at least one.
export function checkCategoryChoice(values: number[], liveIds: number[]): CategoryChoice {
  const ids = liveIds.filter((id) => values.includes(id));
  return ids.length > 0 ? { ok: true, ids } : { ok: false, error: { code: "category.missing" } };
}

export function releaseFileName(appId: string, serial: number): string {
  if (!Number.isInteger(serial) || serial < 1 || serial > SERIAL_MAX) {
    throw new RangeError(`Serial out of range: ${serial}`);
  }
  return `${appId}-${serial.toString(16).padStart(4, "0")}.zip`;
}

// Accepts only the plain decimal form, so each release has one URL.
export function parseSerial(value: string): number | null {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) {
    return null;
  }
  const serial = Number(value);
  return serial <= SERIAL_MAX ? serial : null;
}

export function parseSlot(value: string): number | null {
  const slot = Number(value);
  return /^[1-9]$/.test(value) && slot <= SCREENSHOT_SLOTS ? slot : null;
}

export function screenshotUrl(appId: string, slot: number, updatedAt: Date): string {
  return `/catalogue/${appId}/screenshots/${slot}?v=${updatedAt.getTime()}`;
}

export const CATALOGUE_PAGE_SIZE = 20;

// Anything that is not a plain positive number gives page 1.
export function parsePage(value: string | string[] | undefined): number {
  return typeof value === "string" && /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : 1;
}

export function parseQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

// The query string of a page's searchParams, with its "?" when there is one.
export function searchOf(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    for (const one of [value ?? []].flat()) {
      search.append(name, one);
    }
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

export function catalogueHref(base: string, query: string, page: number): string {
  const params = new URLSearchParams();
  if (query !== "") {
    params.set("q", query);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const search = params.toString();
  return search === "" ? base : `${base}?${search}`;
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DateCheck = { ok: true; day: string } | { ok: false; error: Problem };

export function checkReleaseDate(input: string, uploadDate: Date): DateCheck {
  const today = isoDay(uploadDate);
  if (input === "") {
    return { ok: true, day: today };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ok: false, error: { code: "releaseDate.invalid" } };
  }
  const parsed = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || isoDay(parsed) !== input) {
    return { ok: false, error: { code: "releaseDate.invalid" } };
  }
  if (input > today) {
    return { ok: false, error: { code: "releaseDate.future" } };
  }
  return { ok: true, day: input };
}

export const ARTICLE_MAX = 1024;

export type ArticleCheck = { ok: true; article: string } | { ok: false; error: Problem };

// A browser sends CR LF from a textarea; the stored text uses LF only.
export function checkArticle(input: string): ArticleCheck {
  const article = input.replace(/\r\n/g, "\n");
  if (article.length < 1 || article.length > ARTICLE_MAX) {
    return { ok: false, error: { code: "feature.articleLength", min: 1, max: ARTICLE_MAX } };
  }
  return { ok: true, article };
}

export type PublishAtCheck = { ok: true; publishAt: Date | null } | { ok: false; error: Problem };

// The input is UTC, as the browser's toISOString() writes it. The form sends
// the stored time back as it was unless the admin changed it, and only a
// changed time must not be in the past.
export function checkPublishAt(input: string, stored: Date | null, now: Date): PublishAtCheck {
  if (input === "") {
    return { ok: true, publishAt: null };
  }
  const publishAt = new Date(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(input) || Number.isNaN(publishAt.getTime())) {
    return { ok: false, error: { code: "feature.publishInvalid" } };
  }
  const changed = stored === null || stored.getTime() !== publishAt.getTime();
  if (changed && publishAt < now) {
    return { ok: false, error: { code: "feature.publishPast" } };
  }
  return { ok: true, publishAt };
}

// Accepts only the plain decimal form, so each feature has one URL.
export function parseFeatureId(value: string): number | null {
  return /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : null;
}

const dayFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// Built from parts: "en-GB" gives "Sept".
export function formatDay(day: string): string {
  const parts = Object.fromEntries(
    dayFormat.formatToParts(new Date(`${day}T00:00:00Z`)).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

export const APP_LIMIT_MAX = 0xffffffff;

export type LimitInput = { ok: true; limit: number | null } | { ok: false; error: Problem };

export function parseLimit(input: string): LimitInput {
  const value = input.trim();
  if (value === "") {
    return { ok: true, limit: null };
  }
  if (!/^\d+$/.test(value) || Number(value) > APP_LIMIT_MAX) {
    return { ok: false, error: { code: "limit.notNumber" } };
  }
  return { ok: true, limit: Number(value) };
}

export function appLimitFor(userLimit: number | null, defaultLimit: number | null): number | null {
  return userLimit ?? defaultLimit;
}

export function canCreateApp(appCount: number, limit: number | null): boolean {
  return limit === null || appCount < limit;
}
