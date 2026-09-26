import type { Problem } from "./problems";

export const USERNAME_MAX = 16;
export const USERNAME_UI_MIN = 8;
export const VERSION_MAX = 16;
export const TITLE_MAX = 32;
export const DESCRIPTION_MAX = 256;
export const SERIAL_MAX = 0xffff;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_TEXT = "4 MB";

const SLUG_CHAR = /[A-Za-z0-9_-]/;
const VERSION_CHAR = /[A-Za-z0-9_.,#-]/;
const PRINTABLE_ASCII_CHAR = /[\x20-\x7e]/;
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
