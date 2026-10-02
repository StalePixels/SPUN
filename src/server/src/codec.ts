import type { AppId, AppInfo, Changelog, FoundApp, Release, Screenshot } from "./catalogue.js";

export const PROTOCOL_VERSION = 2;
export const FORMAT_VERSION = 1;
export const MAX_BLOCK_SIZE = 4096;

// Tags from LONG_TAG have a u16 length, the others a u8 length, so a client
// can skip any tag it does not know.
export const LONG_TAG = 0x80;

export const Tag = {
  total: 0x01,
  page: 0x02,
  pages: 0x03,
  app: 0x10,
  appId: 0x11,
  username: 0x12,
  title: 0x13,
  serial: 0x14,
  version: 0x15,
  downloads: 0x16,
  date: 0x17,
  release: 0x18,
  category: 0x19,
  screenshot: 0x1a,
  slot: 0x1b,
  width: 0x1c,
  description: 0x80,
  changelog: 0x81,
} as const;

export interface FindPage {
  total: number;
  page: number;
  pages: number;
  apps: FoundApp[];
}

export interface InfoPage {
  app: AppInfo;
  total: number;
  page: number;
  pages: number;
  releases: Release[];
}

class Writer {
  readonly bytes: number[] = [];

  field(tag: number, value: ArrayLike<number>): void {
    const limit = tag >= LONG_TAG ? 0xffff : 0xff;
    if (value.length > limit) {
      throw new RangeError(`Field ${tag} is ${value.length} bytes`);
    }
    this.bytes.push(tag, value.length & 255);
    if (tag >= LONG_TAG) {
      this.bytes.push(value.length >> 8);
    }
    for (let i = 0; i < value.length; i++) {
      this.bytes.push(value[i]);
    }
  }

  u8(tag: number, value: number): void {
    this.field(tag, [value & 255]);
  }

  u16(tag: number, value: number): void {
    this.field(tag, [value & 255, (value >> 8) & 255]);
  }

  u32(tag: number, value: number): void {
    this.field(tag, [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255]);
  }

  text(tag: number, value: string): void {
    this.field(tag, Buffer.from(value, "ascii"));
  }

  group(tag: number, fill: (inner: Writer) => void): void {
    const inner = new Writer();
    fill(inner);
    this.field(tag, inner.bytes);
  }

  reply(): Uint8Array {
    if (this.bytes.length > MAX_BLOCK_SIZE) {
      throw new RangeError(`Reply block is ${this.bytes.length} bytes`);
    }
    const size = this.bytes.length;
    return Uint8Array.from([
      PROTOCOL_VERSION,
      FORMAT_VERSION,
      size & 255,
      size >> 8,
      ...this.bytes,
      checksum(this.bytes),
    ]);
  }
}

export function checksum(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum += bytes[i];
  }
  return sum % 256;
}

function counts(out: Writer, page: { total: number; page: number; pages: number }): void {
  out.u16(Tag.total, page.total);
  out.u16(Tag.page, page.page);
  out.u16(Tag.pages, page.pages);
}

export function encodeFind(page: FindPage): Uint8Array {
  const out = new Writer();
  counts(out, page);
  for (const app of page.apps) {
    out.group(Tag.app, (entry) => {
      entry.text(Tag.appId, app.id);
      entry.text(Tag.username, app.username);
      entry.text(Tag.title, app.title);
      entry.u16(Tag.serial, app.latest.serial);
      entry.text(Tag.version, app.latest.version);
      entry.u32(Tag.downloads, app.downloads);
    });
  }
  return out.reply();
}

export function encodeInfo(page: InfoPage): Uint8Array {
  const out = new Writer();
  counts(out, page);
  out.text(Tag.username, page.app.username);
  out.text(Tag.title, page.app.title);
  out.text(Tag.description, page.app.description);
  out.u32(Tag.downloads, page.app.downloads);
  for (const category of page.app.categories) {
    out.text(Tag.category, category);
  }
  for (const shot of page.app.screenshots) {
    out.group(Tag.screenshot, (entry) => {
      entry.u8(Tag.slot, shot.slot);
      entry.u16(Tag.width, shot.width);
    });
  }
  for (const release of page.releases) {
    out.group(Tag.release, (entry) => {
      entry.u16(Tag.serial, release.serial);
      entry.text(Tag.version, release.version);
      entry.text(Tag.date, release.date);
    });
  }
  return out.reply();
}

export function encodeChangelog(release: Changelog): Uint8Array {
  const out = new Writer();
  out.u16(Tag.serial, release.serial);
  out.text(Tag.version, release.version);
  out.text(Tag.date, release.date);
  if (release.changelog !== null) {
    out.text(Tag.changelog, release.changelog);
  }
  return out.reply();
}

export function encodeError(code: string): Uint8Array {
  return Uint8Array.from([...Buffer.from(code, "ascii"), 13, 10]);
}

export interface Field {
  tag: number;
  value: Uint8Array;
}

export function readFields(bytes: Uint8Array): Field[] {
  const fields: Field[] = [];
  let at = 0;
  while (at < bytes.length) {
    const tag = bytes[at];
    const head = tag >= LONG_TAG ? 3 : 2;
    if (at + head > bytes.length) {
      throw new Error("Field header runs past its end");
    }
    const length = tag >= LONG_TAG ? bytes[at + 1] | (bytes[at + 2] << 8) : bytes[at + 1];
    const end = at + head + length;
    if (end > bytes.length) {
      throw new Error("Field runs past its end");
    }
    fields.push({ tag, value: bytes.slice(at + head, end) });
    at = end;
  }
  return fields;
}

// Throws a RangeError while the reply is still short, so a test client can
// read until it is whole.
export function readReply(bytes: Uint8Array): Field[] {
  if (bytes.length >= 1 && bytes[0] !== PROTOCOL_VERSION) {
    throw new Error(`Not an NBN reply: first byte ${bytes[0]}`);
  }
  if (bytes.length < 4) {
    throw new RangeError("Reply is too short");
  }
  if (bytes[1] !== FORMAT_VERSION) {
    throw new Error(`Unknown SPUN format ${bytes[1]}`);
  }
  const size = bytes[2] | (bytes[3] << 8);
  if (bytes.length < 4 + size + 1) {
    throw new RangeError("Reply is too short");
  }
  if (bytes.length > 4 + size + 1) {
    throw new Error("Reply has extra bytes");
  }
  const body = bytes.slice(4, 4 + size);
  if (bytes[4 + size] !== checksum(body)) {
    throw new Error("Bad block checksum");
  }
  return readFields(body);
}

export function fieldNumber(value: Uint8Array): number {
  let number = 0;
  for (let i = Math.min(value.length, 4) - 1; i >= 0; i--) {
    number = number * 256 + value[i];
  }
  return number;
}

const fieldText = (value: Uint8Array): string => String.fromCharCode(...value);

function readCounts(fields: Field[]): { total: number; page: number; pages: number } {
  const page = { total: 0, page: 0, pages: 0 };
  for (const { tag, value } of fields) {
    if (tag === Tag.total) page.total = fieldNumber(value);
    if (tag === Tag.page) page.page = fieldNumber(value);
    if (tag === Tag.pages) page.pages = fieldNumber(value);
  }
  return page;
}

export function decodeFind(bytes: Uint8Array): FindPage {
  const fields = readReply(bytes);
  const apps: FoundApp[] = [];
  for (const entry of fields.filter((field) => field.tag === Tag.app)) {
    const app: FoundApp = {
      id: "" as AppId,
      username: "",
      title: "",
      latest: { serial: 0, version: "" },
      downloads: 0,
    };
    for (const { tag, value } of readFields(entry.value)) {
      if (tag === Tag.appId) app.id = fieldText(value) as AppId;
      if (tag === Tag.username) app.username = fieldText(value);
      if (tag === Tag.title) app.title = fieldText(value);
      if (tag === Tag.serial) app.latest.serial = fieldNumber(value);
      if (tag === Tag.version) app.latest.version = fieldText(value);
      if (tag === Tag.downloads) app.downloads = fieldNumber(value);
    }
    apps.push(app);
  }
  return { ...readCounts(fields), apps };
}

export function decodeInfo(bytes: Uint8Array): InfoPage {
  const fields = readReply(bytes);
  const app: AppInfo = { username: "", title: "", description: "", downloads: 0, categories: [], screenshots: [] };
  const releases: Release[] = [];
  for (const { tag, value } of fields) {
    if (tag === Tag.username) app.username = fieldText(value);
    if (tag === Tag.title) app.title = fieldText(value);
    if (tag === Tag.description) app.description = fieldText(value);
    if (tag === Tag.downloads) app.downloads = fieldNumber(value);
    if (tag === Tag.category) app.categories.push(fieldText(value));
    if (tag === Tag.screenshot) {
      const shot: Screenshot = { slot: 0, width: 0 };
      for (const inner of readFields(value)) {
        if (inner.tag === Tag.slot) shot.slot = fieldNumber(inner.value);
        if (inner.tag === Tag.width) shot.width = fieldNumber(inner.value);
      }
      app.screenshots.push(shot);
    }
    if (tag === Tag.release) {
      const release: Release = { serial: 0, version: "", date: "" };
      for (const inner of readFields(value)) {
        if (inner.tag === Tag.serial) release.serial = fieldNumber(inner.value);
        if (inner.tag === Tag.version) release.version = fieldText(inner.value);
        if (inner.tag === Tag.date) release.date = fieldText(inner.value);
      }
      releases.push(release);
    }
  }
  return { app, ...readCounts(fields), releases };
}

export function decodeChangelog(bytes: Uint8Array): Changelog {
  const release: Changelog = { serial: 0, version: "", date: "", changelog: null };
  for (const { tag, value } of readReply(bytes)) {
    if (tag === Tag.serial) release.serial = fieldNumber(value);
    if (tag === Tag.version) release.version = fieldText(value);
    if (tag === Tag.date) release.date = fieldText(value);
    if (tag === Tag.changelog) release.changelog = fieldText(value);
  }
  return release;
}
