import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIND_PAGE_SIZE,
  INFO_CATEGORIES_MAX,
  INFO_PAGE_SIZE,
  LIST_PAGE_SIZE,
  type AppId,
  type Changelog,
} from "../src/catalogue.js";
import {
  decodeChangelog,
  decodeFind,
  decodeInfo,
  encodeChangelog,
  encodeError,
  encodeFind,
  encodeInfo,
  MAX_BLOCK_SIZE,
  type FindPage,
  type InfoPage,
} from "../src/codec.js";
import { ascii, counts, field, le, reply } from "./golden.js";
import { settings } from "./settings.js";

const bytes = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, "hex"));
const toHex = (value: Uint8Array): string => Buffer.from(value).toString("hex");
const user = settings.publisher;

const FIND_PAGE: FindPage = {
  total: 2,
  page: 1,
  pages: 1,
  apps: [
    {
      id: "tst001" as AppId,
      username: user,
      title: "Test App",
      latest: { serial: 1, version: "test-upload-01" },
      downloads: 0x01020304,
    },
    {
      id: "tst002" as AppId,
      username: user,
      title: "3",
      latest: { serial: 2, version: "1.1" },
      downloads: 0,
    },
  ],
};

const appEntry = (id: string, title: string, serial: number, version: string, downloads: number): string =>
  field(
    0x10,
    field(0x11, ascii(id)) +
      field(0x12, ascii(user)) +
      field(0x13, ascii(title)) +
      field(0x14, le(serial, 2)) +
      field(0x15, ascii(version)) +
      field(0x16, le(downloads, 4)),
  );

const FIND_HEX = reply(
  counts(2, 1, 1) +
    appEntry("tst001", "Test App", 1, "test-upload-01", 0x01020304) +
    appEntry("tst002", "3", 2, "1.1", 0),
);

const INFO_PAGE: InfoPage = {
  app: {
    username: user,
    title: "Test App",
    description: "A test app",
    downloads: 7,
    categories: ["Games", "Tools"],
    screenshots: [
      { slot: 1, width: 256 },
      { slot: 3, width: 320 },
    ],
  },
  total: 2,
  page: 1,
  pages: 1,
  releases: [
    { serial: 2, version: "1.1", date: "2026-09-26" },
    { serial: 1, version: "1.0", date: "2020-05-17" },
  ],
};

const INFO_HEX = reply(
  counts(2, 1, 1) +
    field(0x12, ascii(user)) +
    field(0x13, ascii("Test App")) +
    field(0x80, ascii("A test app")) +
    field(0x16, le(7, 4)) +
    field(0x19, ascii("Games")) +
    field(0x19, ascii("Tools")) +
    field(0x1a, field(0x1b, "01") + field(0x1c, le(256, 2))) +
    field(0x1a, field(0x1b, "03") + field(0x1c, le(320, 2))) +
    field(0x18, field(0x14, le(2, 2)) + field(0x15, ascii("1.1")) + field(0x17, ascii("2026-09-26"))) +
    field(0x18, field(0x14, le(1, 2)) + field(0x15, ascii("1.0")) + field(0x17, ascii("2020-05-17"))),
);

const CHANGELOG: Changelog = { serial: 3, version: "1.2", date: "2026-10-01", changelog: "Fixed\nthings" };

const CHANGELOG_HEX = reply(
  field(0x14, le(3, 2)) +
    field(0x15, ascii("1.2")) +
    field(0x17, ascii("2026-10-01")) +
    field(0x81, ascii("Fixed\nthings")),
);

test("SPFIND encodes to the agreed bytes", () => {
  assert.equal(toHex(encodeFind(FIND_PAGE)), FIND_HEX);
});

test("SPFIND decodes the agreed bytes", () => {
  assert.deepEqual(decodeFind(bytes(FIND_HEX)), FIND_PAGE);
});

test("an empty SPFIND page holds only the counts", () => {
  const empty: FindPage = { total: 0, page: 1, pages: 0, apps: [] };
  const expected = reply(counts(0, 1, 0));
  assert.equal(toHex(encodeFind(empty)), expected);
  assert.deepEqual(decodeFind(bytes(expected)), empty);
});

test("SPINFO encodes to the agreed bytes", () => {
  assert.equal(toHex(encodeInfo(INFO_PAGE)), INFO_HEX);
});

test("SPINFO decodes the agreed bytes", () => {
  assert.deepEqual(decodeInfo(bytes(INFO_HEX)), INFO_PAGE);
});

test("SPCLOG encodes and decodes the agreed bytes", () => {
  assert.equal(toHex(encodeChangelog(CHANGELOG)), CHANGELOG_HEX);
  assert.deepEqual(decodeChangelog(bytes(CHANGELOG_HEX)), CHANGELOG);
});

test("SPCLOG of a release with no changelog has no changelog field", () => {
  const none: Changelog = { ...CHANGELOG, changelog: null };
  const expected = reply(field(0x14, le(3, 2)) + field(0x15, ascii("1.2")) + field(0x17, ascii("2026-10-01")));
  assert.equal(toHex(encodeChangelog(none)), expected);
  assert.deepEqual(decodeChangelog(bytes(expected)), none);
});

test("a client skips tags it does not know, short and long, at both levels", () => {
  const unknownShort = field(0x7e, "aabbcc");
  const unknownLong = field(0xfe, "dd".repeat(300));
  const withUnknown = reply(
    unknownLong +
      counts(2, 1, 1) +
      unknownShort +
      field(
        0x10,
        field(0x11, ascii("tst001")) +
          unknownShort +
          field(0x12, ascii(user)) +
          field(0x13, ascii("Test App")) +
          field(0xfd, "") + // a long tag with length 0
          field(0x14, le(1, 2)) +
          field(0x15, ascii("test-upload-01")) +
          field(0x16, le(0x01020304, 4)),
      ) +
      field(0x6f, "") +
      appEntry("tst002", "3", 2, "1.1", 0),
  );
  assert.deepEqual(decodeFind(bytes(withUnknown)), FIND_PAGE);
});

test("integers are read from the bytes sent, so a field may grow", () => {
  const wide = reply(counts(1, 1, 1) + field(0x10, field(0x11, ascii("tst001")) + field(0x16, le(5, 1))));
  assert.equal(decodeFind(bytes(wide)).apps[0].downloads, 5);
});

test("errors are ASCII text ending in _ERROR and CR LF", () => {
  assert.equal(toHex(encodeError("NoApp_ERROR")), "4e6f4170705f4552524f520d0a");
  // The client's UART_WaitOK stops on the last four bytes "OR\r\n".
  assert.equal(Buffer.from(encodeError("BadQuery_ERROR")).subarray(-4).toString(), "OR\r\n");
});

test("decode rejects a bad checksum", () => {
  const broken = bytes(FIND_HEX);
  broken[broken.length - 1] ^= 1;
  assert.throws(() => decodeFind(broken), /checksum/);
});

test("decode rejects an error text and an unknown format version", () => {
  assert.throws(() => decodeInfo(encodeError("NoApp_ERROR")), /Not an NBN reply/);
  const later = bytes(FIND_HEX);
  later[1] = 2;
  assert.throws(() => decodeFind(later), /format/);
});

// The largest values the CMS allows (src/web/src/lib/rules.ts and the column sizes).
const MAX = { username: 16, title: 32, version: 16, description: 256, category: 32, changelog: 1024, slots: 5 };

const largestApp = {
  id: "zzzzzz" as AppId,
  username: "u".repeat(MAX.username),
  title: "t".repeat(MAX.title),
  latest: { serial: 0xffff, version: "v".repeat(MAX.version) },
  downloads: 0xffffffff,
};

test("the largest SPFIND and SPLIST pages fit in one block", () => {
  for (const size of [FIND_PAGE_SIZE, LIST_PAGE_SIZE]) {
    const page = encodeFind({
      total: 0xffff,
      page: 0xffff,
      pages: 0xffff,
      apps: Array.from({ length: size }, () => largestApp),
    });
    // 12 bytes of counts, then 90 bytes for each entry.
    assert.equal(page.length - 5, 12 + size * 90);
    assert.ok(page.length - 5 <= MAX_BLOCK_SIZE);
  }
});

test("the largest SPINFO page fits in one block", () => {
  const page = encodeInfo({
    app: {
      username: "u".repeat(MAX.username),
      title: "t".repeat(MAX.title),
      description: "d".repeat(MAX.description),
      downloads: 0xffffffff,
      categories: Array.from({ length: INFO_CATEGORIES_MAX }, () => "c".repeat(MAX.category)),
      screenshots: Array.from({ length: MAX.slots }, (_, i) => ({ slot: i + 1, width: 320 })),
    },
    total: 0xffff,
    page: 0xffff,
    pages: 0xffff,
    releases: Array.from({ length: INFO_PAGE_SIZE }, () => ({
      serial: 0xffff,
      version: "v".repeat(MAX.version),
      date: "2026-10-01",
    })),
  });
  // counts 12, username 18, title 34, description 259, downloads 6,
  // categories 34 each, screenshots 9 each, releases 36 each.
  const body = 12 + 18 + 34 + 259 + 6 + INFO_CATEGORIES_MAX * 34 + MAX.slots * 9 + INFO_PAGE_SIZE * 36;
  assert.equal(page.length - 5, body);
  assert.ok(body <= MAX_BLOCK_SIZE);
});

test("the largest SPCLOG reply fits in one block", () => {
  const page = encodeChangelog({
    serial: 0xffff,
    version: "v".repeat(MAX.version),
    date: "2026-10-01",
    changelog: "c".repeat(MAX.changelog),
  });
  assert.equal(page.length - 5, 4 + 18 + 12 + 3 + MAX.changelog);
  assert.ok(page.length - 5 <= MAX_BLOCK_SIZE);
});
