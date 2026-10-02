import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  keySecret,
  keyString,
  newKeyId,
  parseKeyId,
  parseKeyString,
  sign,
  signatureMatches,
  signedText,
  timestampInWindow,
} from "./keys";

const SERVER_KEY = "server-key-for-tests";
const KEY_ID = "0123456789abcdef";

describe("key id", () => {
  it("is 16 characters from 0-9a-z", () => {
    for (let i = 0; i < 50; i++) {
      expect(newKeyId()).toMatch(/^[0-9a-z]{16}$/);
    }
  });

  it("parses only that form", () => {
    expect(parseKeyId(KEY_ID)).toBe(KEY_ID);
    expect(parseKeyId("0123456789ABCDEF")).toBeNull();
    expect(parseKeyId("0123456789abcde")).toBeNull();
    expect(parseKeyId("0123456789abcdef0")).toBeNull();
  });
});

describe("key secret", () => {
  it("is the HMAC-SHA256 of the key id with the server key, as 64 hex characters", () => {
    const secret = keySecret(SERVER_KEY, KEY_ID);
    expect(secret).toBe(createHmac("sha256", SERVER_KEY).update(KEY_ID).digest("hex"));
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the same each time, and changes with the key id or the server key", () => {
    expect(keySecret(SERVER_KEY, KEY_ID)).toBe(keySecret(SERVER_KEY, KEY_ID));
    expect(keySecret(SERVER_KEY, "fedcba9876543210")).not.toBe(keySecret(SERVER_KEY, KEY_ID));
    expect(keySecret("another-server-key", KEY_ID)).not.toBe(keySecret(SERVER_KEY, KEY_ID));
  });
});

describe("key string", () => {
  const secret = keySecret(SERVER_KEY, KEY_ID);

  it("is nbnspun-<key id>-<secret>, and splits back into both", () => {
    const key = keyString(KEY_ID, secret);
    expect(key).toBe(`nbnspun-${KEY_ID}-${secret}`);
    expect(parseKeyString(key)).toEqual({ keyId: KEY_ID, secret });
  });

  it.each([
    ["no prefix", `${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID)}`],
    ["another prefix", `nbnspan-${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID)}`],
    ["a short key id", `nbnspun-${KEY_ID.slice(1)}-${keySecret(SERVER_KEY, KEY_ID)}`],
    ["a short secret", `nbnspun-${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID).slice(1)}`],
    ["an uppercase secret", `nbnspun-${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID).toUpperCase()}`],
    ["an extra part", `nbnspun-${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID)}-x`],
    ["spaces around it", ` nbnspun-${KEY_ID}-${keySecret(SERVER_KEY, KEY_ID)} `],
    ["nothing", ""],
  ])("refuses a key string with %s", (_name, value) => {
    expect(parseKeyString(value)).toBeNull();
  });
});

describe("signature", () => {
  it("signs the method, path with query, timestamp and nonce, one to a line", () => {
    expect(signedText("get", "/api/apps?x=1", "1700000000", "abcdefghijklmnop")).toBe(
      "GET\n/api/apps?x=1\n1700000000\nabcdefghijklmnop",
    );
  });

  it("matches only the right HMAC", () => {
    const secret = keySecret(SERVER_KEY, KEY_ID);
    const text = signedText("GET", "/api/apps", "1700000000", "abcdefghijklmnop");
    const good = sign(secret, text);
    expect(good).toBe(createHmac("sha256", secret).update(text).digest("hex"));
    expect(signatureMatches(good, good)).toBe(true);
    expect(signatureMatches(good, good.toUpperCase())).toBe(true);
    expect(signatureMatches(good, sign(secret, `${text}x`))).toBe(false);
    expect(signatureMatches(good, good.slice(1))).toBe(false);
    expect(signatureMatches(good, "z".repeat(64))).toBe(false);
  });
});

describe("timestamp window", () => {
  const now = 1_700_000_000;

  it("accepts a timestamp up to 5 minutes before or after now", () => {
    expect(timestampInWindow(now, now)).toBe(true);
    expect(timestampInWindow(now - 300, now)).toBe(true);
    expect(timestampInWindow(now + 300, now)).toBe(true);
  });

  it("refuses one just outside", () => {
    expect(timestampInWindow(now - 301, now)).toBe(false);
    expect(timestampInWindow(now + 301, now)).toBe(false);
  });
});
