import { beforeEach, describe, expect, it } from "vitest";
import { apiLimits, checkApiCall, type ApiCall, type ApiDeps, type ApiOptions } from "./apigate";
import { keySecret, sign, signedText } from "./keys";
import {
  API_IP_PER_MINUTE,
  API_JSON_BODY_MAX,
  API_KEY_PER_MINUTE,
  API_RELEASE_BODY_MAX,
  API_SCREENSHOT_BODY_MAX,
  API_UPLOADS_PER_HOUR,
} from "./rules";

const SERVER_KEY = "server-key-for-tests";
const KEY_ID = "0123456789abcdef";
const OTHER_KEY_ID = "fedcba9876543210";
const USER = { id: "user-1", username: "Fanny" };
// 10:00:00 UTC, the start of a minute and of an hour.
const START_MS = Date.UTC(2026, 9, 2, 10, 0, 0);

// Redis as a map, with expiry by the fake clock.
function fakeDeps(liveKeys: string[] = [KEY_ID, OTHER_KEY_ID]) {
  let now = START_MS;
  const store = new Map<string, { value: number; expires: number }>();
  const live = (name: string) => {
    const entry = store.get(name);
    return entry && entry.expires > now ? entry : undefined;
  };
  const deps: ApiDeps = {
    nowMs: () => now,
    serverKey: () => SERVER_KEY,
    limits: apiLimits({}),
    findKeyUser: async (keyId) => (liveKeys.includes(keyId) ? USER : null),
    claimOnce: async (name, ttl) => {
      if (live(name)) return false;
      store.set(name, { value: 1, expires: now + ttl * 1000 });
      return true;
    },
    count: async (name, ttl) => {
      const entry = live(name);
      const value = (entry?.value ?? 0) + 1;
      store.set(name, { value, expires: now + ttl * 1000 });
      return value;
    },
  };
  return {
    deps,
    advance(seconds: number) {
      now += seconds * 1000;
    },
    nowSeconds: () => Math.floor(now / 1000),
  };
}

let nonceCounter = 0;
function freshNonce(): string {
  nonceCounter += 1;
  return `nonce${String(nonceCounter).padStart(12, "0")}`;
}

type CallInput = {
  method?: string;
  path?: string;
  keyId?: string;
  secret?: string;
  timestamp?: number;
  nonce?: string;
  ip?: string;
  headers?: Record<string, string | null>;
};

function signedCall(clock: { nowSeconds(): number }, input: CallInput = {}): ApiCall {
  const method = input.method ?? "GET";
  const path = input.path ?? "/api/apps";
  const keyId = input.keyId ?? KEY_ID;
  const secret = input.secret ?? keySecret(SERVER_KEY, keyId);
  const timestamp = String(input.timestamp ?? clock.nowSeconds());
  const nonce = input.nonce ?? freshNonce();
  const headers: Record<string, string | null> = {
    "x-spun-key": keyId,
    "x-spun-timestamp": timestamp,
    "x-spun-nonce": nonce,
    "x-spun-signature": sign(secret, signedText(method, path, timestamp, nonce)),
    ...input.headers,
  };
  return {
    method,
    pathWithQuery: path,
    ip: input.ip ?? "192.0.2.1",
    header: (name) => headers[name.toLowerCase()] ?? null,
  };
}

const JSON_CALL: ApiOptions = { body: "json" };
const UPLOAD_CALL: ApiOptions = { body: "release", upload: true };

describe("checkApiCall: signature", () => {
  let clock: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    clock = fakeDeps();
  });

  it("accepts a good signature and gives the key's user", async () => {
    expect(await checkApiCall(signedCall(clock), JSON_CALL, clock.deps)).toEqual({ ok: true, user: USER });
  });

  it("signs the query too", async () => {
    const call = signedCall(clock, { path: "/api/apps?page=2" });
    expect((await checkApiCall(call, JSON_CALL, clock.deps)).ok).toBe(true);
  });

  it.each(["x-spun-key", "x-spun-timestamp", "x-spun-nonce", "x-spun-signature"])(
    "gives api.missingHeader without %s",
    async (name) => {
      const call = signedCall(clock, { headers: { [name]: null } });
      expect(await checkApiCall(call, JSON_CALL, clock.deps)).toEqual({
        ok: false,
        status: 401,
        error: { code: "api.missingHeader" },
      });
    },
  );

  it.each([
    ["a nonce of 15 characters", { "x-spun-nonce": "a".repeat(15) }],
    ["a nonce of 65 characters", { "x-spun-nonce": "a".repeat(65) }],
    ["a nonce with a dash", { "x-spun-nonce": "abcdefgh-ijklmnop" }],
    ["a timestamp that is not a number", { "x-spun-timestamp": "soon" }],
    ["a signature that is not hex", { "x-spun-signature": "z".repeat(64) }],
  ])("gives api.missingHeader for %s", async (_name, headers) => {
    const call = signedCall(clock, { headers });
    expect(await checkApiCall(call, JSON_CALL, clock.deps)).toMatchObject({
      status: 401,
      error: { code: "api.missingHeader" },
    });
  });

  it("accepts nonces of 16 and 64 characters", async () => {
    for (const nonce of ["A".repeat(16), "b9".repeat(32)]) {
      expect((await checkApiCall(signedCall(clock, { nonce }), JSON_CALL, clock.deps)).ok).toBe(true);
    }
  });

  it("gives api.badKey for an unknown, deleted or malformed key id", async () => {
    const deps = fakeDeps([]);
    for (const keyId of [KEY_ID, "not-a-key-id"]) {
      expect(await checkApiCall(signedCall(deps, { keyId }), JSON_CALL, deps.deps)).toEqual({
        ok: false,
        status: 401,
        error: { code: "api.badKey" },
      });
    }
  });

  it("gives api.badSignature for another secret, method or path", async () => {
    const otherSecret = signedCall(clock, { secret: keySecret("another-server-key", KEY_ID) });
    const signedForPost = signedCall(clock, { method: "POST" });
    const asGet = { ...signedForPost, method: "GET" };
    const signedForOther = signedCall(clock, { path: "/api/other" });
    const onApps = { ...signedForOther, pathWithQuery: "/api/apps" };
    for (const call of [otherSecret, asGet, onApps]) {
      expect(await checkApiCall(call, JSON_CALL, clock.deps)).toEqual({
        ok: false,
        status: 401,
        error: { code: "api.badSignature" },
      });
    }
  });

  it("accepts a timestamp just inside the 5 minutes and gives api.oldRequest just outside", async () => {
    const now = clock.nowSeconds();
    for (const timestamp of [now - 300, now + 300]) {
      expect((await checkApiCall(signedCall(clock, { timestamp }), JSON_CALL, clock.deps)).ok).toBe(true);
    }
    for (const timestamp of [now - 301, now + 301]) {
      expect(await checkApiCall(signedCall(clock, { timestamp }), JSON_CALL, clock.deps)).toEqual({
        ok: false,
        status: 401,
        error: { code: "api.oldRequest" },
      });
    }
  });

  it("gives api.nonceUsed for a repeated request, and for a nonce the key used before", async () => {
    const call = signedCall(clock);
    expect((await checkApiCall(call, JSON_CALL, clock.deps)).ok).toBe(true);
    expect(await checkApiCall(call, JSON_CALL, clock.deps)).toEqual({
      ok: false,
      status: 401,
      error: { code: "api.nonceUsed" },
    });
    const again = signedCall(clock, { nonce: "sameNonceSameKey00" });
    expect((await checkApiCall(again, JSON_CALL, clock.deps)).ok).toBe(true);
    const later = signedCall(clock, { nonce: "sameNonceSameKey00", path: "/api/apps?x=1" });
    expect(await checkApiCall(later, JSON_CALL, clock.deps)).toMatchObject({ error: { code: "api.nonceUsed" } });
  });

  it("keeps a nonce until its timestamp leaves the window", async () => {
    const timestamp = clock.nowSeconds();
    const call = signedCall(clock, { timestamp });
    expect((await checkApiCall(call, JSON_CALL, clock.deps)).ok).toBe(true);
    clock.advance(300);
    expect(await checkApiCall(call, JSON_CALL, clock.deps)).toMatchObject({ error: { code: "api.nonceUsed" } });
    clock.advance(1);
    expect(await checkApiCall(call, JSON_CALL, clock.deps)).toMatchObject({ error: { code: "api.oldRequest" } });
  });
});

describe("checkApiCall: body size", () => {
  let clock: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    clock = fakeDeps();
  });

  it.each([
    ["json", API_JSON_BODY_MAX],
    ["release", API_RELEASE_BODY_MAX],
    ["screenshot", API_SCREENSHOT_BODY_MAX],
  ] as const)("accepts a %s body at its limit and gives 413 api.bodyTooLarge one byte over", async (body, max) => {
    const at = signedCall(clock, { method: "POST", headers: { "content-length": String(max) } });
    expect((await checkApiCall(at, { body }, clock.deps)).ok).toBe(true);
    const over = signedCall(clock, { method: "POST", headers: { "content-length": String(max + 1) } });
    expect(await checkApiCall(over, { body }, clock.deps)).toEqual({
      ok: false,
      status: 413,
      error: { code: "api.bodyTooLarge", max },
    });
  });

  it("gives 411 api.lengthRequired for a POST or PUT without Content-Length", async () => {
    for (const method of ["POST", "PUT"]) {
      expect(await checkApiCall(signedCall(clock, { method }), JSON_CALL, clock.deps)).toEqual({
        ok: false,
        status: 411,
        error: { code: "api.lengthRequired" },
      });
    }
    for (const method of ["GET", "DELETE"]) {
      expect((await checkApiCall(signedCall(clock, { method }), JSON_CALL, clock.deps)).ok).toBe(true);
    }
  });

  it("gives 411 api.lengthRequired for a chunked body without Content-Length on any method", async () => {
    for (const method of ["GET", "DELETE", "POST", "PUT"]) {
      const call = signedCall(clock, { method, headers: { "transfer-encoding": "chunked" } });
      expect(await checkApiCall(call, JSON_CALL, clock.deps)).toEqual({
        ok: false,
        status: 411,
        error: { code: "api.lengthRequired" },
      });
    }
  });

  it("checks the size before the signature", async () => {
    const call = signedCall(clock, {
      method: "POST",
      headers: { "content-length": String(API_JSON_BODY_MAX + 1), "x-spun-signature": null },
    });
    expect(await checkApiCall(call, JSON_CALL, clock.deps)).toMatchObject({ status: 413 });
  });
});

describe("checkApiCall: rate limits", () => {
  let clock: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    clock = fakeDeps();
  });

  it("gives api.tooManyRequests one request over the limit per IP address, signed or not, until the minute ends", async () => {
    clock.advance(20);
    for (let i = 0; i < API_IP_PER_MINUTE; i++) {
      const call = signedCall(clock, { ip: "192.0.2.9", headers: { "x-spun-signature": null } });
      expect(await checkApiCall(call, JSON_CALL, clock.deps)).toMatchObject({ status: 401 });
    }
    const over = signedCall(clock, { ip: "192.0.2.9" });
    expect(await checkApiCall(over, JSON_CALL, clock.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 40,
    });
    expect((await checkApiCall(signedCall(clock, { ip: "192.0.2.10" }), JSON_CALL, clock.deps)).ok).toBe(true);
    clock.advance(39);
    expect(await checkApiCall(signedCall(clock, { ip: "192.0.2.9" }), JSON_CALL, clock.deps)).toMatchObject({
      status: 429,
      retryAfter: 1,
    });
    clock.advance(1);
    expect((await checkApiCall(signedCall(clock, { ip: "192.0.2.9" }), JSON_CALL, clock.deps)).ok).toBe(true);
  });

  it("gives api.tooManyRequests one request over the limit per key, from any address, until the minute ends", async () => {
    clock.advance(45);
    for (let i = 0; i < API_KEY_PER_MINUTE; i++) {
      const call = signedCall(clock, { ip: `192.0.2.${i}` });
      expect((await checkApiCall(call, JSON_CALL, clock.deps)).ok).toBe(true);
    }
    expect(await checkApiCall(signedCall(clock, { ip: "198.51.100.1" }), JSON_CALL, clock.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 15,
    });
    const otherKey = signedCall(clock, { keyId: OTHER_KEY_ID, ip: "198.51.100.1" });
    expect((await checkApiCall(otherKey, JSON_CALL, clock.deps)).ok).toBe(true);
    clock.advance(15);
    expect((await checkApiCall(signedCall(clock, { ip: "198.51.100.1" }), JSON_CALL, clock.deps)).ok).toBe(true);
  });

  it("gives api.tooManyRequests one upload over the limit per key, until the hour ends", async () => {
    const upload = () =>
      signedCall(clock, { method: "POST", headers: { "content-length": "100" }, ip: `192.0.2.${nonceCounter % 250}` });
    clock.advance(10 * 60);
    for (let i = 0; i < API_UPLOADS_PER_HOUR; i++) {
      expect((await checkApiCall(upload(), UPLOAD_CALL, clock.deps)).ok).toBe(true);
    }
    expect(await checkApiCall(upload(), UPLOAD_CALL, clock.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 50 * 60,
    });
    expect((await checkApiCall(signedCall(clock), JSON_CALL, clock.deps)).ok, "a call that is not an upload").toBe(true);
    clock.advance(50 * 60);
    expect((await checkApiCall(upload(), UPLOAD_CALL, clock.deps)).ok).toBe(true);
  });
});

describe("apiLimits", () => {
  it("gives the defaults when the environment sets nothing", () => {
    expect(apiLimits({})).toEqual({
      jsonBody: API_JSON_BODY_MAX,
      releaseBody: API_RELEASE_BODY_MAX,
      screenshotBody: API_SCREENSHOT_BODY_MAX,
      ipPerMinute: API_IP_PER_MINUTE,
      keyPerMinute: API_KEY_PER_MINUTE,
      uploadsPerHour: API_UPLOADS_PER_HOUR,
    });
  });

  it("takes each value the environment sets over its default", () => {
    expect(
      apiLimits({
        API_JSON_BODY_MAX: "1000",
        API_RELEASE_BODY_MAX: "2000",
        API_SCREENSHOT_BODY_MAX: "3000",
        API_IP_PER_MINUTE: "4",
        API_KEY_PER_MINUTE: "5",
        API_UPLOADS_PER_HOUR: "0",
      }),
    ).toEqual({
      jsonBody: 1000,
      releaseBody: 2000,
      screenshotBody: 3000,
      ipPerMinute: 4,
      keyPerMinute: 5,
      uploadsPerHour: 0,
    });
    expect(apiLimits({ API_KEY_PER_MINUTE: "7" }).ipPerMinute).toBe(API_IP_PER_MINUTE);
  });

  it("refuses a value that is not a whole number", () => {
    expect(() => apiLimits({ API_IP_PER_MINUTE: "lots" })).toThrow(/API_IP_PER_MINUTE/);
  });

  it("applies an overridden limit", async () => {
    const clock = fakeDeps();
    clock.deps.limits = apiLimits({ API_KEY_PER_MINUTE: "2" });
    expect((await checkApiCall(signedCall(clock), JSON_CALL, clock.deps)).ok).toBe(true);
    expect((await checkApiCall(signedCall(clock), JSON_CALL, clock.deps)).ok).toBe(true);
    expect(await checkApiCall(signedCall(clock), JSON_CALL, clock.deps)).toMatchObject({ status: 429 });
  });
});
