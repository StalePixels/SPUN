import { describe, expect, it } from "vitest";
import {
  appLimitFor,
  invalidCharacters,
  canCreateApp,
  checkReleaseDate,
  parseLimit,
  checkDescription,
  checkTitle,
  checkUsernameInput,
  checkVersion,
  formatDay,
  isValidSlug,
  parseSerial,
  releaseFileName,
  usernameKey,
} from "./rules";

describe("slug rules", () => {
  it("accepts the URL-safe base64 alphabet", () => {
    expect(isValidSlug("Az09-_xY")).toBe(true);
    expect(checkUsernameInput("Az09-_xY")).toBeNull();
  });

  it("rejects other characters", () => {
    for (const bad of ["darran.r", "darran r", "darran/r", "darran+r", "dárranrs"]) {
      expect(isValidSlug(bad)).toBe(false);
      expect(checkUsernameInput(bad)).not.toBeNull();
    }
  });

  it("requires 8 to 16 characters in the UI", () => {
    expect(checkUsernameInput("abcdefg")?.code).toBe("username.length");
    expect(checkUsernameInput("abcdefgh")).toBeNull();
    expect(checkUsernameInput("abcdefghijklmnop")).toBeNull();
    expect(checkUsernameInput("abcdefghijklmnopq")).not.toBeNull();
  });

  it("allows short names outside the UI, up to 16 characters everywhere", () => {
    expect(isValidSlug("D")).toBe(true);
    expect(isValidSlug("abcdefghijklmnop")).toBe(true);
    expect(isValidSlug("abcdefghijklmnopq")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("ignores case for uniqueness", () => {
    expect(usernameKey("Darran")).toBe(usernameKey("darran"));
    expect(usernameKey("Darran")).not.toBe(usernameKey("Darran2"));
  });
});

describe("file name from serial", () => {
  it("gives 4 lowercase hex digits", () => {
    expect(releaseFileName("k3x9qa", 1)).toBe("k3x9qa-0001.zip");
    expect(releaseFileName("k3x9qa", 0xabc)).toBe("k3x9qa-0abc.zip");
    expect(releaseFileName("k3x9qa", 65535)).toBe("k3x9qa-ffff.zip");
  });

  it("rejects serials outside 1 to 65535", () => {
    expect(() => releaseFileName("k3x9qa", 0)).toThrow(RangeError);
    expect(() => releaseFileName("k3x9qa", 65536)).toThrow(RangeError);
  });
});

describe("release date", () => {
  const upload = new Date("2026-09-26T12:00:00Z");

  it("defaults to the upload date", () => {
    expect(checkReleaseDate("", upload)).toEqual({ ok: true, day: "2026-09-26" });
  });

  it("accepts the upload date and earlier dates", () => {
    expect(checkReleaseDate("2026-09-26", upload).ok).toBe(true);
    expect(checkReleaseDate("1985-01-01", upload).ok).toBe(true);
  });

  it("rejects a date after the upload date", () => {
    expect(checkReleaseDate("2026-09-27", upload)).toEqual({
      ok: false,
      error: { code: "releaseDate.future" },
    });
  });

  it("rejects a date that does not exist", () => {
    expect(checkReleaseDate("2026-02-30", upload)).toEqual({
      ok: false,
      error: { code: "releaseDate.invalid" },
    });
  });
});

describe("parseSerial", () => {
  it("accepts 1 to 65535 in plain decimal", () => {
    expect(parseSerial("1")).toBe(1);
    expect(parseSerial("65535")).toBe(65535);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "0", "01", "65536", "99999", "100000", "-1", "1.0", "1e2", "0x1", " 1", "a"]) {
      expect(parseSerial(bad)).toBeNull();
    }
  });
});

describe("formatDay", () => {
  it("shows the stored day without a shift", () => {
    expect(formatDay("2026-09-26")).toBe("26 Sep 2026");
    expect(formatDay("1982-01-01")).toBe("1 Jan 1982");
    expect(formatDay("1999-12-31")).toBe("31 Dec 1999");
  });
});

describe("app limit", () => {
  it("reads an empty value as no limit and a whole number as the limit", () => {
    expect(parseLimit("")).toEqual({ ok: true, limit: null });
    expect(parseLimit(" 3 ")).toEqual({ ok: true, limit: 3 });
    expect(parseLimit("0")).toEqual({ ok: true, limit: 0 });
  });

  it("rejects other values", () => {
    expect(parseLimit("-1")).toEqual({ ok: false, error: { code: "limit.notNumber" } });
    expect(parseLimit("2.5").ok).toBe(false);
    expect(parseLimit("ten").ok).toBe(false);
    expect(parseLimit("4294967296").ok).toBe(false);
  });

  it("uses the user's own limit before the default", () => {
    expect(appLimitFor(5, 2)).toBe(5);
    expect(appLimitFor(null, 2)).toBe(2);
    expect(appLimitFor(null, null)).toBeNull();
  });

  it("allows a new app only below the limit", () => {
    expect(canCreateApp(1, 2)).toBe(true);
    expect(canCreateApp(2, 2)).toBe(false);
    expect(canCreateApp(100, null)).toBe(true);
  });
});

describe("invalid characters", () => {
  it("lists each character the rule does not allow, once, emoji whole", () => {
    expect(invalidCharacters("caf\u00e9 \u00e9 \u{1F600}", /[a-z]/)).toEqual(["\u00e9", " ", "\u{1F600}"]);
    expect(invalidCharacters("abc", /[a-z]/)).toEqual([]);
  });
});

describe("problem codes", () => {
  it("names the rejected characters", () => {
    expect(checkTitle("Caf\u00e9 \u{1F600}")).toEqual({
      code: "title.invalidCharacters",
      chars: ["\u00e9", "\u{1F600}"],
    });
    expect(checkDescription("tab\there")).toEqual({
      code: "description.invalidCharacters",
      chars: ["\t"],
    });
    expect(checkVersion("1.0 beta")).toEqual({ code: "version.invalidCharacters", chars: [" "] });
    expect(checkUsernameInput("Bad Name!")).toEqual({
      code: "username.invalidCharacters",
      chars: [" ", "!"],
    });
  });

  it("gives the length bounds", () => {
    expect(checkTitle("")).toEqual({ code: "title.length", min: 1, max: 32 });
    expect(checkVersion("x".repeat(17))).toEqual({ code: "version.length", min: 1, max: 16 });
  });
});
