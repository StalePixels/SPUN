import type { AppId, AppInfo, FoundApp, Release } from "./catalogue.js";

export const PROTOCOL_VERSION = 2;
const APP_ID_BYTES = 6;

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
  private readonly bytes: number[] = [];

  u8(value: number): void {
    this.bytes.push(value & 255);
  }

  u16(value: number): void {
    this.bytes.push(value & 255, (value >> 8) & 255);
  }

  text(value: string): void {
    this.bytes.push(...Buffer.from(value, "ascii"));
  }

  string(value: string): void {
    this.text(value);
    this.u8(0);
  }

  block(body: Writer): void {
    this.u16(body.bytes.length);
    this.bytes.push(...body.bytes);
    this.u8(checksum(body.bytes));
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) {
      throw new RangeError("Reply is too short");
    }
    return this.bytes[this.offset++];
  }

  u16(): number {
    return this.u8() | (this.u8() << 8);
  }

  text(length: number): string {
    return String.fromCharCode(...Array.from({ length }, () => this.u8()));
  }

  string(): string {
    let value = "";
    for (let byte = this.u8(); byte !== 0; byte = this.u8()) {
      value += String.fromCharCode(byte);
    }
    return value;
  }

  version(): void {
    const version = this.u8();
    if (version !== PROTOCOL_VERSION) {
      throw new Error(`Not an NBN reply: first byte ${version}`);
    }
  }

  block(): Reader {
    const size = this.u16();
    const body = this.bytes.slice(this.offset, this.offset + size);
    if (body.length !== size) {
      throw new RangeError("Reply is too short");
    }
    this.offset += size;
    if (this.u8() !== checksum(body)) {
      throw new Error("Bad block checksum");
    }
    return new Reader(body);
  }

  end(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error("Reply has extra bytes");
    }
  }
}

export function checksum(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum += bytes[i];
  }
  return sum % 256;
}

export function encodeFind(page: FindPage): Uint8Array {
  const out = new Writer();
  out.u8(PROTOCOL_VERSION);
  out.u16(page.total);
  out.u16(page.page);
  out.u8(page.apps.length);
  out.u16(page.pages);
  const body = new Writer();
  for (const app of page.apps) {
    body.text(app.id);
    body.string(app.username);
    body.string(app.title);
    body.u16(app.latest.serial);
    body.string(app.latest.version);
  }
  out.block(body);
  return out.done();
}

export function decodeFind(bytes: Uint8Array): FindPage {
  const input = new Reader(bytes);
  input.version();
  const total = input.u16();
  const page = input.u16();
  const count = input.u8();
  const pages = input.u16();
  const body = input.block();
  input.end();
  const apps: FoundApp[] = [];
  for (let i = 0; i < count; i++) {
    const id = body.text(APP_ID_BYTES) as AppId;
    const username = body.string();
    const title = body.string();
    const serial = body.u16();
    const version = body.string();
    apps.push({ id, username, title, latest: { serial, version } });
  }
  body.end();
  return { total, page, pages, apps };
}

export function encodeInfo(page: InfoPage): Uint8Array {
  const out = new Writer();
  out.u8(PROTOCOL_VERSION);
  out.string(page.app.username);
  out.string(page.app.title);
  out.string(page.app.description);
  out.u16(page.total);
  out.u16(page.page);
  out.u8(page.releases.length);
  out.u16(page.pages);
  const body = new Writer();
  for (const release of page.releases) {
    body.u16(release.serial);
    body.string(release.version);
    body.string(release.date);
  }
  out.block(body);
  return out.done();
}

export function decodeInfo(bytes: Uint8Array): InfoPage {
  const input = new Reader(bytes);
  input.version();
  const app = { username: input.string(), title: input.string(), description: input.string() };
  const total = input.u16();
  const page = input.u16();
  const count = input.u8();
  const pages = input.u16();
  const body = input.block();
  input.end();
  const releases: Release[] = [];
  for (let i = 0; i < count; i++) {
    releases.push({ serial: body.u16(), version: body.string(), date: body.string() });
  }
  body.end();
  return { app, total, page, pages, releases };
}

export function encodeError(code: string): Uint8Array {
  return Uint8Array.from([...Buffer.from(code, "ascii"), 13, 10]);
}
