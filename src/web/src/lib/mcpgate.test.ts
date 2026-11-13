import { beforeEach, describe, expect, it } from "vitest";
import { apiLimits } from "./apigate";
import { bearerToken, checkMcpCall, MCP_TOUCH_SECONDS, wwwAuthenticate, type McpCall, type McpDeps, type McpGrant } from "./mcpgate";
import { ACCESS_TOKEN_PREFIX, tokenHash } from "./oauth";
import { API_IP_PER_MINUTE, API_JSON_BODY_MAX, API_KEY_PER_MINUTE } from "./rules";

// 10:00:00 UTC, the start of a minute.
const START_MS = Date.UTC(2026, 9, 2, 10, 0, 0);
const TOKEN = `${ACCESS_TOKEN_PREFIX}token-one`;
const OTHER_TOKEN = `${ACCESS_TOKEN_PREFIX}token-two`;

function grantFor(id: string, overrides: Partial<McpGrant> = {}): McpGrant {
  return {
    id,
    clientIdHash: `client-of-${id}`,
    userId: "user-1",
    username: "Fanny",
    userDisabled: false,
    deletedAt: null,
    accessExpiresAt: new Date(START_MS + 60 * 60 * 1000),
    acceptedTermsId: null,
    ...overrides,
  };
}

// Redis as a map, with expiry by the fake clock; grants by token hash.
function fakeDeps() {
  let now = START_MS;
  const terms = { current: null as number | null };
  const store = new Map<string, { value: number; expires: number }>();
  const grants = new Map<string, McpGrant>([
    [tokenHash(TOKEN), grantFor("grant-1")],
    [tokenHash(OTHER_TOKEN), grantFor("grant-2")],
  ]);
  const lookups: string[] = [];
  const touches: { id: string; at: number }[] = [];
  const live = (name: string) => {
    const entry = store.get(name);
    return entry && entry.expires > now ? entry : undefined;
  };
  const deps: McpDeps = {
    nowMs: () => now,
    limits: apiLimits({}),
    findGrant: async (hash) => {
      lookups.push(hash);
      return grants.get(hash) ?? null;
    },
    currentTermsId: async () => terms.current,
    claimOnce: async (name, ttl) => {
      if (live(name)) return false;
      store.set(name, { value: 1, expires: now + ttl * 1000 });
      return true;
    },
    count: async (name, ttl, hits = 1) => {
      const value = (live(name)?.value ?? 0) + hits;
      store.set(name, { value, expires: now + ttl * 1000 });
      return value;
    },
    touchGrant: async (id, at) => {
      touches.push({ id, at: at.getTime() });
    },
  };
  return {
    deps,
    terms,
    grants,
    lookups,
    touches,
    advance(seconds: number) {
      now += seconds * 1000;
    },
  };
}

const MESSAGE = { jsonrpc: "2.0", id: 1, method: "tools/list" };

function call(headers: Record<string, string | null> = {}, ip = "192.0.2.1", body = JSON.stringify(MESSAGE)): McpCall {
  const all: Record<string, string | null> = { authorization: `Bearer ${TOKEN}`, "content-length": "100", ...headers };
  return { ip, header: (name) => all[name.toLowerCase()] ?? null, text: async () => body };
}

const batch = (n: number) => JSON.stringify(Array.from({ length: n }, (_, id) => ({ ...MESSAGE, id })));

describe("checkMcpCall: token", () => {
  let fake: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    fake = fakeDeps();
  });

  it("accepts a live token and gives the grant's user", async () => {
    expect(await checkMcpCall(call(), fake.deps)).toEqual({
      ok: true,
      user: { id: "user-1", username: "Fanny" },
      grant: { id: "grant-1", clientIdHash: "client-of-grant-1", accessExpiresAt: new Date(START_MS + 60 * 60 * 1000) },
      body: { value: MESSAGE },
    });
    expect(fake.lookups).toEqual([tokenHash(TOKEN)]);
  });

  it("takes the scheme in any case", async () => {
    expect((await checkMcpCall(call({ authorization: `bearer ${TOKEN}` }), fake.deps)).ok).toBe(true);
  });

  it.each([
    ["no Authorization header", null],
    ["another scheme", `Basic ${TOKEN}`],
    ["Bearer with no token", "Bearer "],
    ["a token in two parts", `Bearer ${TOKEN} extra`],
  ])("gives 401 mcp.noToken for %s, without a lookup", async (_name, authorization) => {
    expect(await checkMcpCall(call({ authorization }), fake.deps)).toEqual({
      ok: false,
      status: 401,
      error: { code: "mcp.noToken" },
    });
    expect(fake.lookups).toEqual([]);
  });

  it("gives 401 mcp.badToken for an unknown token", async () => {
    const result = await checkMcpCall(call({ authorization: `Bearer ${ACCESS_TOKEN_PREFIX}unknown` }), fake.deps);
    expect(result).toEqual({ ok: false, status: 401, error: { code: "mcp.badToken" } });
  });

  it("gives 401 mcp.badToken for a token without the access token prefix, without a lookup", async () => {
    const result = await checkMcpCall(call({ authorization: "Bearer nbnspun-rt-refresh" }), fake.deps);
    expect(result).toMatchObject({ status: 401, error: { code: "mcp.badToken" } });
    expect(fake.lookups).toEqual([]);
  });

  it.each([
    ["a revoked grant", { deletedAt: new Date(START_MS - 1000) }],
    ["an expired access token", { accessExpiresAt: new Date(START_MS) }],
    ["a disabled user", { userDisabled: true }],
    ["a user with no username", { username: null }],
  ])("gives 401 mcp.badToken for %s", async (_name, overrides) => {
    fake.grants.set(tokenHash(TOKEN), grantFor("grant-1", overrides));
    expect(await checkMcpCall(call(), fake.deps)).toEqual({ ok: false, status: 401, error: { code: "mcp.badToken" } });
    expect(fake.touches).toEqual([]);
  });

  it("refuses a token once its expiry time has passed", async () => {
    expect((await checkMcpCall(call(), fake.deps)).ok).toBe(true);
    fake.advance(60 * 60);
    expect(await checkMcpCall(call(), fake.deps)).toMatchObject({ status: 401, error: { code: "mcp.badToken" } });
  });

  it("gives 403 api.termsNotAccepted when the user has not accepted the current terms", async () => {
    fake.terms.current = 3;
    fake.grants.set(tokenHash(TOKEN), grantFor("grant-1", { acceptedTermsId: 2 }));
    expect(await checkMcpCall(call(), fake.deps)).toEqual({
      ok: false,
      status: 403,
      error: { code: "api.termsNotAccepted" },
    });
    fake.grants.set(tokenHash(TOKEN), grantFor("grant-1", { acceptedTermsId: 3 }));
    expect((await checkMcpCall(call(), fake.deps)).ok).toBe(true);
  });
});

describe("checkMcpCall: Origin", () => {
  it.each(["https://evil.example", "null", ""])("gives 403 mcp.origin for Origin %j, before the rate limit and the lookup", async (origin) => {
    const fake = fakeDeps();
    for (let n = 0; n < API_IP_PER_MINUTE + 5; n += 1) {
      expect(await checkMcpCall(call({ origin }), fake.deps)).toEqual({ ok: false, status: 403, error: { code: "mcp.origin" } });
    }
    expect(fake.lookups).toEqual([]);
    expect((await checkMcpCall(call(), fake.deps)).ok).toBe(true);
  });
});

describe("checkMcpCall: body", () => {
  it("gives the parsed body, and null for a body that is not JSON", async () => {
    const fake = fakeDeps();
    expect(await checkMcpCall(call({}, "192.0.2.1", batch(2)), fake.deps)).toMatchObject({ ok: true, body: { value: JSON.parse(batch(2)) } });
    expect(await checkMcpCall(call({}, "192.0.2.1", "{not json"), fake.deps)).toMatchObject({ ok: true, body: null });
    expect(await checkMcpCall(call({}, "192.0.2.1", ""), fake.deps)).toMatchObject({ ok: true, body: null });
  });

  it("gives 413 api.bodyTooLarge when the body read is over the limit, whatever Content-Length said", async () => {
    const fake = fakeDeps();
    const big = JSON.stringify({ ...MESSAGE, params: { pad: "x".repeat(API_JSON_BODY_MAX) } });
    expect(await checkMcpCall(call({}, "192.0.2.1", big), fake.deps)).toEqual({
      ok: false,
      status: 413,
      error: { code: "api.bodyTooLarge", max: API_JSON_BODY_MAX },
    });
    expect(fake.lookups).toEqual([]);
  });
});

describe("checkMcpCall: body size", () => {
  it("gives 411 api.lengthRequired with no Content-Length, before the rate limit and the lookup", async () => {
    const fake = fakeDeps();
    for (let n = 0; n < API_IP_PER_MINUTE + 5; n += 1) {
      expect(await checkMcpCall(call({ "content-length": null }), fake.deps)).toEqual({
        ok: false,
        status: 411,
        error: { code: "api.lengthRequired" },
      });
    }
    expect(fake.lookups).toEqual([]);
    expect((await checkMcpCall(call(), fake.deps)).ok).toBe(true);
  });

  it("gives 413 api.bodyTooLarge over the JSON limit, and accepts the limit itself", async () => {
    const fake = fakeDeps();
    expect(await checkMcpCall(call({ "content-length": String(API_JSON_BODY_MAX + 1) }), fake.deps)).toEqual({
      ok: false,
      status: 413,
      error: { code: "api.bodyTooLarge", max: API_JSON_BODY_MAX },
    });
    expect((await checkMcpCall(call({ "content-length": String(API_JSON_BODY_MAX) }), fake.deps)).ok).toBe(true);
  });
});

describe("checkMcpCall: rate limits", () => {
  it("limits one address to the API's number a minute, before the lookup, with or without a token", async () => {
    const fake = fakeDeps();
    for (let n = 0; n < API_IP_PER_MINUTE; n += 1) {
      const token = n % 2 === 0 ? TOKEN : OTHER_TOKEN;
      const result = await checkMcpCall(call({ authorization: n === 0 ? null : `Bearer ${token}` }), fake.deps);
      expect(result).not.toMatchObject({ status: 429 });
    }
    const lookups = fake.lookups.length;
    expect(await checkMcpCall(call(), fake.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 60,
    });
    expect(fake.lookups).toHaveLength(lookups);
    expect((await checkMcpCall(call({}, "192.0.2.2"), fake.deps)).ok).toBe(true);
    fake.advance(60);
    expect((await checkMcpCall(call(), fake.deps)).ok).toBe(true);
  });

  it("limits one grant to the API's per-key number a minute, from any address", async () => {
    const fake = fakeDeps();
    for (let n = 0; n < API_KEY_PER_MINUTE; n += 1) {
      expect((await checkMcpCall(call({}, `198.51.100.${n}`), fake.deps)).ok).toBe(true);
    }
    fake.advance(30);
    expect(await checkMcpCall(call({}, "203.0.113.1"), fake.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 30,
    });
    expect((await checkMcpCall(call({ authorization: `Bearer ${OTHER_TOKEN}` }, "203.0.113.2"), fake.deps)).ok).toBe(true);
    fake.advance(30);
    expect((await checkMcpCall(call({}, "203.0.113.3"), fake.deps)).ok).toBe(true);
  });

  it("counts each message of a batch against the address", async () => {
    const fake = fakeDeps();
    expect((await checkMcpCall(call({}, "192.0.2.1", batch(API_IP_PER_MINUTE - 1)), fake.deps)).ok).toBe(true);
    expect((await checkMcpCall(call({ authorization: `Bearer ${OTHER_TOKEN}` }), fake.deps)).ok).toBe(true);
    expect(await checkMcpCall(call({ authorization: `Bearer ${OTHER_TOKEN}` }), fake.deps)).toMatchObject({ status: 429 });
    expect(await checkMcpCall(call({}, "192.0.2.2", batch(API_IP_PER_MINUTE + 1)), fakeDeps().deps)).toMatchObject({
      status: 429,
    });
  });

  it("counts each message of a batch against the grant, from any address", async () => {
    const fake = fakeDeps();
    expect((await checkMcpCall(call({}, "198.51.100.1", batch(API_KEY_PER_MINUTE - 2)), fake.deps)).ok).toBe(true);
    expect((await checkMcpCall(call({}, "198.51.100.2", batch(2)), fake.deps)).ok).toBe(true);
    expect(await checkMcpCall(call({}, "198.51.100.3"), fake.deps)).toMatchObject({ status: 429, error: { code: "api.tooManyRequests" } });
    expect((await checkMcpCall(call({ authorization: `Bearer ${OTHER_TOKEN}` }, "198.51.100.4"), fake.deps)).ok).toBe(true);
  });

  it("counts an empty batch and a body that is not JSON as one message", async () => {
    const fake = fakeDeps();
    for (let n = 0; n < API_KEY_PER_MINUTE; n += 1) {
      const body = n % 2 === 0 ? "[]" : "{not json";
      expect((await checkMcpCall(call({}, `198.51.100.${n}`, body), fake.deps)).ok).toBe(true);
    }
    expect(await checkMcpCall(call({}, "203.0.113.1"), fake.deps)).toMatchObject({ status: 429 });
  });

  it("does not count a refused token against a grant", async () => {
    const fake = fakeDeps();
    for (let n = 0; n < API_KEY_PER_MINUTE + 5; n += 1) {
      await checkMcpCall(call({ authorization: `Bearer ${ACCESS_TOKEN_PREFIX}unknown` }, `198.51.100.${n}`), fake.deps);
    }
    expect((await checkMcpCall(call({}, "203.0.113.1"), fake.deps)).ok).toBe(true);
  });
});

describe("checkMcpCall: last used time", () => {
  it(`writes last_used_at at most once in ${MCP_TOUCH_SECONDS} seconds for each grant`, async () => {
    const fake = fakeDeps();
    await checkMcpCall(call(), fake.deps);
    fake.advance(10);
    await checkMcpCall(call(), fake.deps);
    await checkMcpCall(call({ authorization: `Bearer ${OTHER_TOKEN}` }), fake.deps);
    fake.advance(MCP_TOUCH_SECONDS - 10 - 1);
    await checkMcpCall(call(), fake.deps);
    expect(fake.touches).toEqual([
      { id: "grant-1", at: START_MS },
      { id: "grant-2", at: START_MS + 10_000 },
    ]);
    fake.advance(1);
    await checkMcpCall(call(), fake.deps);
    expect(fake.touches.at(-1)).toEqual({ id: "grant-1", at: START_MS + MCP_TOUCH_SECONDS * 1000 });
  });

  it("does not write it for a refused call", async () => {
    const fake = fakeDeps();
    fake.terms.current = 1;
    await checkMcpCall(call(), fake.deps);
    expect(fake.touches).toEqual([]);
  });
});

describe("bearerToken and wwwAuthenticate", () => {
  it("reads the token after the scheme", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("BEARER  abc ")).toBe("abc");
    expect(bearerToken(null)).toBeNull();
  });

  it("names the resource metadata, and invalid_token only when a token was refused", () => {
    const url = "https://spun.example/.well-known/oauth-protected-resource/mcp";
    expect(wwwAuthenticate(url, { code: "mcp.noToken" })).toBe(`Bearer resource_metadata="${url}"`);
    expect(wwwAuthenticate(url, { code: "mcp.badToken" })).toBe(`Bearer resource_metadata="${url}", error="invalid_token"`);
  });
});
