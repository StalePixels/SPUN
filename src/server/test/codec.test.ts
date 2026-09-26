import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppId } from "../src/catalogue.js";
import {
  decodeFind,
  decodeInfo,
  encodeError,
  encodeFind,
  encodeInfo,
  type FindPage,
  type InfoPage,
} from "../src/codec.js";
import { hexString, settings } from "./settings.js";

const hex = (...parts: string[]): string => parts.join("");
const bytes = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, "hex"));
const user = settings.publisher;

// The username is a setting, so a block that holds it gets its size and
// checksum from here: u16 little-endian length, then the byte sum mod 256.
const blockSize = (body: string): string => {
  const length = body.length / 2;
  return hex((length & 255).toString(16).padStart(2, "0"), (length >> 8).toString(16).padStart(2, "0"));
};
const blockSum = (body: string): string =>
  (Buffer.from(body, "hex").reduce((sum, byte) => sum + byte, 0) % 256).toString(16).padStart(2, "0");

// Golden bytes were computed outside the codec (Python), from the layout in the plan.
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
    },
    {
      id: "tst002" as AppId,
      username: user,
      title: "3",
      latest: { serial: 2, version: "1.1" },
    },
  ],
};

const FIND_BODY = hex(
  "747374303031", // tst001
  hexString(user), // username\0
  "546573742041707000", // Test App\0
  "0100", // latest serial 1
  "746573742d75706c6f61642d303100", // test-upload-01\0
  "747374303032", // tst002
  hexString(user), // username\0
  "3300", // 3\0
  "0200", // latest serial 2
  "312e3100", // 1.1\0
);

const FIND_HEX = hex(
  "02", // version
  "0200", // total matches
  "0100", // page
  "02", // entries on this page
  "0100", // total pages
  blockSize(FIND_BODY),
  FIND_BODY,
  blockSum(FIND_BODY),
);

const INFO_PAGE: InfoPage = {
  app: { username: user, title: "Test App", description: "A test app" },
  total: 2,
  page: 1,
  pages: 1,
  releases: [
    { serial: 2, version: "1.1", date: "2026-09-26" },
    { serial: 1, version: "1.0", date: "2020-05-17" },
  ],
};

const INFO_HEX = hex(
  "02", // version
  hexString(user), // username\0
  "546573742041707000", // Test App\0
  "4120746573742061707000", // A test app\0
  "0200", // total releases
  "0100", // page
  "02", // releases on this page
  "0100", // total pages
  "2200", // block size
  "0200", // serial 2
  "312e3100", // 1.1\0
  "323032362d30392d323600", // 2026-09-26\0
  "0100", // serial 1
  "312e3000", // 1.0\0
  "323032302d30352d313700", // 2020-05-17\0
  "02", // checksum
);

test("FIND encodes to the agreed bytes", () => {
  assert.equal(Buffer.from(encodeFind(FIND_PAGE)).toString("hex"), FIND_HEX);
});

test("FIND decodes the agreed bytes", () => {
  assert.deepEqual(decodeFind(bytes(FIND_HEX)), FIND_PAGE);
});

test("an empty FIND page still sends an empty block", () => {
  const empty: FindPage = { total: 0, page: 1, pages: 0, apps: [] };
  const expected = "02" + "0000" + "0100" + "00" + "0000" + "0000" + "00";
  assert.equal(Buffer.from(encodeFind(empty)).toString("hex"), expected);
  assert.deepEqual(decodeFind(bytes(expected)), empty);
});

test("INFO encodes to the agreed bytes", () => {
  assert.equal(Buffer.from(encodeInfo(INFO_PAGE)).toString("hex"), INFO_HEX);
});

test("INFO decodes the agreed bytes", () => {
  assert.deepEqual(decodeInfo(bytes(INFO_HEX)), INFO_PAGE);
});

test("errors are ASCII text ending in _ERROR and CR LF", () => {
  assert.equal(Buffer.from(encodeError("NoApp_ERROR")).toString("hex"), "4e6f4170705f4552524f520d0a");
  // The client's UART_WaitOK stops on the last four bytes "OR\r\n".
  assert.equal(Buffer.from(encodeError("BadQuery_ERROR")).subarray(-4).toString(), "OR\r\n");
});

test("decode rejects a bad checksum", () => {
  const broken = bytes(FIND_HEX);
  broken[broken.length - 1] ^= 1;
  assert.throws(() => decodeFind(broken), /checksum/);
});

test("decode rejects an error text", () => {
  assert.throws(() => decodeInfo(encodeError("NoApp_ERROR")), /Not an NBN reply/);
});

test("a full page of the largest entries fits the limits in the plan", () => {
  // One FIND entry is at most 75 bytes; one INFO release at most 30.
  const find = encodeFind({
    total: 1,
    page: 1,
    pages: 1,
    apps: [
      {
        id: "zzzzzz" as AppId,
        username: "u".repeat(16),
        title: "t".repeat(32),
        latest: { serial: 0xffff, version: "v".repeat(16) },
      },
    ],
  });
  assert.equal(find.length - 8 - 2 - 1, 75);
  const info = encodeInfo({
    app: { username: "", title: "", description: "" },
    total: 1,
    page: 1,
    pages: 1,
    releases: [{ serial: 0xffff, version: "v".repeat(16), date: "2026-09-26" }],
  });
  assert.equal(info.length - 11 - 2 - 1, 30);
});
