import { beforeEach, describe, expect, it } from "vitest";
import { apiLimits } from "./apigate";
import { tokenHash } from "./oauth";
import {
  API_IP_PER_MINUTE,
  API_RELEASE_BODY_MAX,
  API_SCREENSHOT_BODY_MAX,
  MCP_UPLOAD_TICKET_SECONDS,
  RELEASE_FIELDS_BYTES,
} from "./rules";
import {
  makeTicket,
  parseTicket,
  ticketKey,
  takeTicket,
  type TicketCall,
  type TicketDeps,
  type TicketGrant,
  type TicketUser,
  type UploadTicket,
} from "./uploadticket";

// 10:00:00 UTC, the start of a minute.
const START_MS = Date.UTC(2026, 9, 2, 10, 0, 0);
const RELEASE: UploadTicket = {
  userId: "user-1",
  grantId: "grant-1",
  appId: "abc123",
  kind: "release",
  slot: null,
  version: "1.0",
  releaseDate: "",
  changelog: "First.",
};
const SCREENSHOT: UploadTicket = { userId: "user-1", grantId: "grant-1", appId: "abc123", kind: "screenshot", slot: 2 };

// Redis as a map, with expiry by the fake clock.
function fakeDeps() {
  let now = START_MS;
  const terms = { current: null as number | null };
  const store = new Map<string, { value: string; expires: number }>();
  const users = new Map<string, TicketUser>([["user-1", { username: "Fanny", disabled: false, acceptedTermsId: null, uploadLimitMb: null }]]);
  const grants = new Map<string, TicketGrant>([
    ["grant-1", { deletedAt: null, refreshExpiresAt: new Date(START_MS + 30 * 24 * 60 * 60 * 1000) }],
  ]);
  const stored: { name: string; ttl: number }[] = [];
  const live = (name: string) => {
    const entry = store.get(name);
    return entry && entry.expires > now ? entry : undefined;
  };
  const deps: TicketDeps = {
    nowMs: () => now,
    limits: apiLimits({}),
    count: async (name, ttl) => {
      const value = Number(live(name)?.value ?? 0) + 1;
      store.set(name, { value: String(value), expires: now + ttl * 1000 });
      return value;
    },
    storeValue: async (name, value, ttl) => {
      stored.push({ name, ttl });
      store.set(name, { value, expires: now + ttl * 1000 });
    },
    readValue: async (name) => live(name)?.value ?? null,
    takeValue: async (name) => {
      const entry = live(name);
      store.delete(name);
      return entry?.value ?? null;
    },
    findUser: async (id) => users.get(id) ?? null,
    findGrant: async (id) => grants.get(id) ?? null,
    currentTermsId: async () => terms.current,
  };
  return {
    deps,
    terms,
    users,
    grants,
    stored,
    has: (name: string) => live(name) !== undefined,
    advance(seconds: number) {
      now += seconds * 1000;
    },
  };
}

function call(headers: Record<string, string | null> = {}, ip = "192.0.2.1"): TicketCall {
  const all: Record<string, string | null> = { "content-length": "100", ...headers };
  return { ip, header: (name) => all[name.toLowerCase()] ?? null };
}

const BAD_TICKET = { ok: false, status: 404, error: { code: "upload.badTicket" } };

describe("parseTicket", () => {
  it("reads a release ticket and a screenshot ticket", () => {
    expect(parseTicket(JSON.stringify(RELEASE))).toEqual(RELEASE);
    expect(parseTicket(JSON.stringify(SCREENSHOT))).toEqual(SCREENSHOT);
  });

  it.each([
    ["nothing", null],
    ["text that is not JSON", "{"],
    ["JSON that is not an object", "[]"],
    ["no user", JSON.stringify({ ...RELEASE, userId: "" })],
    ["no grant", JSON.stringify({ ...RELEASE, grantId: "" })],
    ["a release with no version", JSON.stringify({ ...RELEASE, version: undefined })],
    ["a release with no release date", JSON.stringify({ ...RELEASE, releaseDate: undefined })],
    ["a release with a changelog that is not text", JSON.stringify({ ...RELEASE, changelog: 7 })],
    ["a bad app id", JSON.stringify({ ...RELEASE, appId: "ABC123" })],
    ["an unknown kind", JSON.stringify({ ...RELEASE, kind: "other" })],
    ["a release with a slot", JSON.stringify({ ...RELEASE, slot: 1 })],
    ["a screenshot without a slot", JSON.stringify({ ...SCREENSHOT, slot: null })],
    ["a screenshot in slot 0", JSON.stringify({ ...SCREENSHOT, slot: 0 })],
    ["a screenshot in slot 6", JSON.stringify({ ...SCREENSHOT, slot: 6 })],
    ["a screenshot slot as text", JSON.stringify({ ...SCREENSHOT, slot: "2" })],
  ])("gives null for %s", (_name, text) => {
    expect(parseTicket(text)).toBeNull();
  });
});

describe("makeTicket", () => {
  it("stores the ticket under a hash of a new random token, for the ticket lifetime", async () => {
    const fake = fakeDeps();
    const first = await makeTicket(RELEASE, fake.deps);
    const second = await makeTicket(RELEASE, fake.deps);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
    expect(first.expiresAt).toEqual(new Date(START_MS + MCP_UPLOAD_TICKET_SECONDS * 1000));
    expect(fake.stored).toEqual([
      { name: `mcp:upload:${tokenHash(first.token)}`, ttl: MCP_UPLOAD_TICKET_SECONDS },
      { name: `mcp:upload:${tokenHash(second.token)}`, ttl: MCP_UPLOAD_TICKET_SECONDS },
    ]);
    expect(fake.stored.some((entry) => entry.name.includes(first.token))).toBe(false);
  });
});

describe("takeTicket", () => {
  let fake: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    fake = fakeDeps();
  });

  it("gives the ticket and its user once, then 404 upload.badTicket", async () => {
    const { token } = await makeTicket(SCREENSHOT, fake.deps);
    expect(await takeTicket(call(), token, fake.deps)).toEqual({
      ok: true,
      ticket: SCREENSHOT,
      user: { id: "user-1", username: "Fanny" },
    });
    expect(fake.has(ticketKey(token))).toBe(false);
    expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
  });

  it("refuses a ticket once its lifetime has passed", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    fake.advance(MCP_UPLOAD_TICKET_SECONDS - 1);
    expect(await takeTicket(call(), token, fake.deps)).toMatchObject({ ok: true });
    const late = await makeTicket(RELEASE, fake.deps);
    fake.advance(MCP_UPLOAD_TICKET_SECONDS);
    expect(await takeTicket(call(), late.token, fake.deps)).toEqual(BAD_TICKET);
  });

  it.each([["an unknown token", "A".repeat(43)], ["a token of the wrong form", "short"], ["an empty token", ""]])(
    "gives 404 upload.badTicket for %s",
    async (_name, token) => {
      expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
    },
  );

  it("gives 411 with no Content-Length and keeps the ticket", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    expect(await takeTicket(call({ "content-length": null }), token, fake.deps)).toEqual({
      ok: false,
      status: 411,
      error: { code: "api.lengthRequired" },
    });
    expect(fake.has(ticketKey(token))).toBe(true);
  });

  it("applies the body limit of the ticket's kind, and keeps a ticket whose body is too large", async () => {
    const release = await makeTicket(RELEASE, fake.deps);
    const screenshot = await makeTicket(SCREENSHOT, fake.deps);
    const over = String(API_RELEASE_BODY_MAX + 1);
    expect(await takeTicket(call({ "content-length": over }), release.token, fake.deps)).toEqual({
      ok: false,
      status: 413,
      error: { code: "api.bodyTooLarge", max: API_RELEASE_BODY_MAX },
    });
    expect(fake.has(ticketKey(release.token))).toBe(true);
    expect(await takeTicket(call({ "content-length": over }), screenshot.token, fake.deps)).toMatchObject({ ok: true });
    const big = await makeTicket(SCREENSHOT, fake.deps);
    const tooBig = String(API_SCREENSHOT_BODY_MAX + 1);
    expect(await takeTicket(call({ "content-length": tooBig }), big.token, fake.deps)).toMatchObject({
      status: 413,
      error: { code: "api.bodyTooLarge", max: API_SCREENSHOT_BODY_MAX },
    });
  });

  it("holds a release body to the user's own zip limit", async () => {
    fake.users.set("user-1", { username: "Fanny", disabled: false, acceptedTermsId: null, uploadLimitMb: 10 });
    const max = 10 * 1024 * 1024 + RELEASE_FIELDS_BYTES;
    const release = await makeTicket(RELEASE, fake.deps);
    expect(await takeTicket(call({ "content-length": String(max + 1) }), release.token, fake.deps)).toEqual({
      ok: false,
      status: 413,
      error: { code: "api.bodyTooLarge", max },
    });
    expect(await takeTicket(call({ "content-length": String(max) }), release.token, fake.deps)).toMatchObject({ ok: true });
  });

  it("limits requests per address before it reads a ticket, and keeps the ticket", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    for (let i = 0; i < API_IP_PER_MINUTE; i++) {
      await takeTicket(call(), "A".repeat(43), fake.deps);
    }
    expect(await takeTicket(call(), token, fake.deps)).toEqual({
      ok: false,
      status: 429,
      error: { code: "api.tooManyRequests" },
      retryAfter: 60,
    });
    expect(fake.has(ticketKey(token))).toBe(true);
    expect(await takeTicket(call({}, "192.0.2.2"), token, fake.deps)).toMatchObject({ ok: true });
  });

  it.each([
    ["a disabled user", { username: "Fanny", disabled: true, acceptedTermsId: null, uploadLimitMb: null }],
    ["a user with no username", { username: null, disabled: false, acceptedTermsId: null, uploadLimitMb: null }],
  ])("uses up the ticket of %s and gives 404 upload.badTicket", async (_name, user) => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    fake.users.set("user-1", user);
    expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
    expect(fake.has(ticketKey(token))).toBe(false);
  });

  it.each([
    ["revoked", { deletedAt: new Date(START_MS - 1000), refreshExpiresAt: new Date(START_MS + 60_000) }],
    ["expired", { deletedAt: null, refreshExpiresAt: new Date(START_MS) }],
  ])("uses up the ticket of a grant that is %s and gives 404 upload.badTicket", async (_name, grant) => {
    const { token } = await makeTicket(SCREENSHOT, fake.deps);
    fake.grants.set("grant-1", grant);
    expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
    expect(fake.has(ticketKey(token))).toBe(false);
  });

  it("gives 404 upload.badTicket when the grant no longer exists", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    fake.grants.clear();
    expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
  });

  it("gives 404 upload.badTicket when the user no longer exists", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    fake.users.clear();
    expect(await takeTicket(call(), token, fake.deps)).toEqual(BAD_TICKET);
  });

  it("gives 403 api.termsNotAccepted when the user has not accepted the current terms", async () => {
    const { token } = await makeTicket(RELEASE, fake.deps);
    fake.terms.current = 7;
    expect(await takeTicket(call(), token, fake.deps)).toEqual({
      ok: false,
      status: 403,
      error: { code: "api.termsNotAccepted" },
    });
    fake.users.set("user-1", { username: "Fanny", disabled: false, acceptedTermsId: 7, uploadLimitMb: null });
    const again = await makeTicket(RELEASE, fake.deps);
    expect(await takeTicket(call(), again.token, fake.deps)).toMatchObject({ ok: true });
  });
});
