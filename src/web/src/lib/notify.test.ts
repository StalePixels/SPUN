import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppId } from "./apps";

const after = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => after(callback) }));
// Any database read fails, as a mail server or a database can.
vi.mock("./db", () => ({
  db: () => {
    throw new Error("no database");
  },
}));
vi.mock("./categories", () => ({ appCategoryList: async () => [] }));

const { notify } = await import("./notify");

const notice = { kind: "appDeleted" as const, actorId: "u1", appId: "abc123" as AppId };
const KEYS = ["SMTP_HOST", "ADMIN_NOTIFY_EMAIL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  after.mockReset();
  for (const key of KEYS) saved[key] = process.env[key];
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("notify", () => {
  it("does nothing when mail is not configured", () => {
    delete process.env.SMTP_HOST;
    process.env.ADMIN_NOTIFY_EMAIL = "admin@example.com";
    notify(notice);
    process.env.SMTP_HOST = "relay.example.com";
    delete process.env.ADMIN_NOTIFY_EMAIL;
    notify(notice);
    expect(after).not.toHaveBeenCalled();
  });

  it("sends after the response, and logs a failure instead of throwing it", async () => {
    process.env.SMTP_HOST = "relay.example.com";
    process.env.ADMIN_NOTIFY_EMAIL = "admin@example.com";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    notify(notice);
    expect(after).toHaveBeenCalledTimes(1);
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Admin notice mail (appDeleted) failed:", expect.any(Error));
  });

  it("logs, and does not throw, when it is called outside a request", () => {
    process.env.SMTP_HOST = "relay.example.com";
    process.env.ADMIN_NOTIFY_EMAIL = "admin@example.com";
    after.mockImplementation(() => {
      throw new Error("outside a request");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => notify(notice)).not.toThrow();
    expect(log).toHaveBeenCalledWith("Admin notice mail (appDeleted) not sent:", expect.any(Error));
  });
});
