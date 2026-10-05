import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appLimitFor,
  catalogueHref,
  searchOf,
  invalidCharacters,
  canCreateApp,
  CHANGELOG_MAX,
  checkCategoryChoice,
  checkCategoryName,
  checkCategorySlug,
  checkAlias,
  checkChangelog,
  checkInstallDir,
  checkReleaseDate,
  parseLimit,
  checkDescription,
  checkKeyName,
  checkTitle,
  checkUsernameInput,
  checkVersion,
  checkVersionUnused,
  formatDay,
  isValidSlug,
  parsePage,
  parseQuery,
  parseSerial,
  releaseFileName,
  RESERVED_PATHS,
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

describe("parsePage", () => {
  it("accepts a plain positive number", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("2")).toBe(2);
    expect(parsePage("150")).toBe(150);
  });

  it("gives page 1 when the value is missing, zero, negative or not a number", () => {
    for (const bad of [undefined, "", "0", "00", "-1", "-5", "abc", "2abc", "1.5", "1e2", " 2", "01", "9999999999"]) {
      expect(parsePage(bad), String(bad)).toBe(1);
    }
  });

  it("gives page 1 when the parameter is repeated", () => {
    expect(parsePage(["2", "3"])).toBe(1);
  });
});

describe("parseQuery", () => {
  it("keeps the text as it is, and gives empty text when it is missing or repeated", () => {
    expect(parseQuery("Next Test")).toBe("Next Test");
    expect(parseQuery(undefined)).toBe("");
    expect(parseQuery(["a", "b"])).toBe("");
  });
});

describe("searchOf", () => {
  it("gives the query string of a page's searchParams, keeping repeats and order", () => {
    expect(searchOf({})).toBe("");
    expect(searchOf({ q: undefined })).toBe("");
    expect(searchOf({ q: "a b", page: "2" })).toBe("?q=a+b&page=2");
    expect(searchOf({ q: ["x", "y"], other: "" })).toBe("?q=x&q=y&other=");
  });
});

describe("catalogueHref", () => {
  it("leaves out page 1 and an empty search", () => {
    expect(catalogueHref("/", "", 1)).toBe("/");
    expect(catalogueHref("/games.md", "", 1)).toBe("/games.md");
  });

  it("keeps the search on every page", () => {
    expect(catalogueHref("/", "", 2)).toBe("/?page=2");
    expect(catalogueHref("/games", "a&b c", 1)).toBe("/games?q=a%26b+c");
    expect(catalogueHref("/index.md", "zx", 3)).toBe("/index.md?q=zx&page=3");
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

describe("checkKeyName", () => {
  it("has the rules of an app title, with codes of its own", () => {
    expect(checkKeyName("My agent")).toBeNull();
    expect(checkKeyName("x".repeat(32))).toBeNull();
    expect(checkKeyName("")).toEqual({ code: "keyName.length", min: 1, max: 32 });
    expect(checkKeyName("x".repeat(33))).toEqual({ code: "keyName.length", min: 1, max: 32 });
    expect(checkKeyName("Caf\u00e9")).toEqual({ code: "keyName.invalidCharacters", chars: ["\u00e9"] });
  });
});

describe("version already used", () => {
  it("refuses a version that the app already has, in any case", () => {
    expect(checkVersionUnused("1.0", ["0.9", "1.0"])).toEqual({ code: "version.taken" });
    expect(checkVersionUnused("1.0-BETA", ["1.0-beta"])).toEqual({ code: "version.taken" });
  });

  it("accepts a new version", () => {
    expect(checkVersionUnused("1.1", ["0.9", "1.0"])).toBeNull();
    expect(checkVersionUnused("1.0", [])).toBeNull();
  });
});

describe("checkChangelog", () => {
  it("changes CR LF to LF before the length check", () => {
    const lines = "a\r\n".repeat(CHANGELOG_MAX / 2);
    expect(lines.length).toBe(CHANGELOG_MAX * 1.5);
    expect(checkChangelog(lines)).toEqual({ ok: true, changelog: "a\n".repeat(CHANGELOG_MAX / 2) });
  });

  it("passes exactly 1024 bytes and fails 1025", () => {
    expect(checkChangelog("x".repeat(1024))).toEqual({ ok: true, changelog: "x".repeat(1024) });
    expect(checkChangelog("x".repeat(1025))).toEqual({
      ok: false,
      error: { code: "changelog.length", max: 1024 },
    });
  });

  it("refuses a tab or a non-ASCII character", () => {
    expect(checkChangelog("one\ttwo")).toEqual({
      ok: false,
      error: { code: "changelog.invalidCharacters", chars: ["\t"] },
    });
    expect(checkChangelog("café")).toEqual({
      ok: false,
      error: { code: "changelog.invalidCharacters", chars: ["é"] },
    });
  });

  it("keeps line breaks", () => {
    expect(checkChangelog("Fixed\nAdded")).toEqual({ ok: true, changelog: "Fixed\nAdded" });
  });

  it("gives null for an empty changelog", () => {
    expect(checkChangelog("")).toEqual({ ok: true, changelog: null });
  });
});

describe("checkCategorySlug", () => {
  it("accepts lowercase letters, digits and hyphens", () => {
    expect(checkCategorySlug("games")).toBeNull();
    expect(checkCategorySlug("sys-tool2")).toBeNull();
    expect(checkCategorySlug("apps")).toBeNull();
  });

  it("names the rejected characters", () => {
    expect(checkCategorySlug("Games")).toEqual({ code: "category.invalidCharacters", chars: ["G"] });
    expect(checkCategorySlug("sys tool_")).toEqual({ code: "category.invalidCharacters", chars: [" ", "_"] });
    expect(checkCategorySlug("demo.md")).toEqual({ code: "category.invalidCharacters", chars: ["."] });
    expect(checkCategorySlug("caf\u00e9")).toEqual({ code: "category.invalidCharacters", chars: ["\u00e9"] });
  });

  it("allows 1 to 16 characters", () => {
    expect(checkCategorySlug("a")).toBeNull();
    expect(checkCategorySlug("a".repeat(16))).toBeNull();
    expect(checkCategorySlug("a".repeat(7))).toBeNull();
    expect(checkCategorySlug("")).toEqual({ code: "category.length", min: 1, max: 16 });
    expect(checkCategorySlug("a".repeat(17))).toEqual({ code: "category.length", min: 1, max: 16 });
  });

  it("refuses the form of an app id, 6 lowercase letters and digits, and accepts the live slugs", () => {
    for (const slug of ["abc123", "games1", "123456", "system"]) {
      expect(checkCategorySlug(slug), slug).toEqual({ code: "category.appIdForm" });
    }
    for (const slug of ["apps", "games", "demos", "music", "basic", "systool", "other", "abc-12", "abc1234", "abc12"]) {
      expect(checkCategorySlug(slug), slug).toBeNull();
    }
  });

  it.each(RESERVED_PATHS)("refuses the reserved name %s", (name) => {
    expect(checkCategorySlug(name)).toEqual({ code: "category.reserved" });
  });
});

describe("RESERVED_PATHS", () => {
  it("matches the top-level folders of the app, except apps and [category], plus index", () => {
    const appDir = path.join(__dirname, "..", "app");
    const folders = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== "apps" && name !== "[category]");
    expect(RESERVED_PATHS.filter((name) => name !== "index").sort()).toEqual(folders.sort());
  });
});

describe("checkCategoryName", () => {
  it("accepts printable ASCII, 1 to 32 characters", () => {
    expect(checkCategoryName("System tools")).toBeNull();
    expect(checkCategoryName("x".repeat(32))).toBeNull();
  });

  it("refuses an empty or a long name", () => {
    expect(checkCategoryName("")).toEqual({ code: "category.length", min: 1, max: 32 });
    expect(checkCategoryName("x".repeat(33))).toEqual({ code: "category.length", min: 1, max: 32 });
  });

  it("names the rejected characters", () => {
    expect(checkCategoryName("Tab\there \u{1F600}")).toEqual({
      code: "category.invalidCharacters",
      chars: ["\t", "\u{1F600}"],
    });
  });
});

describe("checkCategoryChoice", () => {
  it("keeps only live categories", () => {
    expect(checkCategoryChoice([1, 3, 9], [1, 2, 3])).toEqual({ ok: true, ids: [1, 3] });
  });

  it("refuses a choice with no live category", () => {
    expect(checkCategoryChoice([], [1, 2])).toEqual({ ok: false, error: { code: "category.missing" } });
    expect(checkCategoryChoice([9, Number.NaN], [1, 2])).toEqual({ ok: false, error: { code: "category.missing" } });
  });
});

describe("checkInstallDir", () => {
  const stored = (input: string) => {
    const result = checkInstallDir(input);
    return result.ok ? result.installDir : result.error.code;
  };

  it("stores empty and whitespace-only input as no suggestion", () => {
    expect(stored("")).toBeNull();
    expect(stored("   ")).toBeNull();
    expect(stored("\t ")).toBeNull();
  });

  it("normalises backslashes, the leading slash, repeated slashes and the trailing slash", () => {
    expect(stored("apps\\wifi\\spun")).toBe("/apps/wifi/spun");
    expect(stored("/apps/wifi/spun/")).toBe("/apps/wifi/spun");
    expect(stored("apps//wifi///spun")).toBe("/apps/wifi/spun");
    expect(stored("\\\\apps\\/wifi\\")).toBe("/apps/wifi");
    expect(stored("/Games/My App")).toBe("/Games/My App");
  });

  it("refuses drive letters and any colon", () => {
    expect(stored("C:/apps")).toBe("installDir.drive");
    expect(stored("c:apps")).toBe("installDir.drive");
    expect(stored("/apps/a:b")).toBe("installDir.drive");
  });

  it("refuses . and .. path parts, but not dots inside names", () => {
    expect(stored("/apps/./spun")).toBe("installDir.dots");
    expect(stored("/apps/../sys")).toBe("installDir.dots");
    expect(stored("..")).toBe("installDir.dots");
    expect(stored("apps\\..")).toBe("installDir.dots");
    expect(stored("/apps/v1.0/.spun")).toBe("/apps/v1.0/.spun");
  });

  it("refuses characters FAT does not allow and anything outside printable ASCII, and names each bad one", () => {
    for (const char of ['"', "*", "?", "<", ">", "|", "~", "\x00", "\x1f", "\x7f"]) {
      expect(checkInstallDir(`/apps/a${char}b`)).toEqual({
        ok: false,
        error: { code: "installDir.invalidCharacters", chars: [char] },
      });
    }
    expect(checkInstallDir("/apps/café/✓")).toEqual({
      ok: false,
      error: { code: "installDir.invalidCharacters", chars: ["é", "✓"] },
    });
    expect(checkInstallDir("/a*b?c*")).toEqual({
      ok: false,
      error: { code: "installDir.invalidCharacters", chars: ["*", "?"] },
    });
  });

  it("refuses /, and /nextzxos, /sys, /dot and /machines with everything under them, in any case", () => {
    for (const input of [
      "/",
      "\\",
      "//",
      "/nextzxos",
      "/NextZXOS/",
      "/sys",
      "/sys/foo",
      "sys\\foo",
      "/dot",
      "/DOT/x",
      "/machines",
      "/Machines/next",
      "/dot ",
    ]) {
      expect(stored(input)).toBe("installDir.banned");
    }
  });

  it("refuses a part that ends with a dot or a space, and the 8.3 alias of a banned directory", () => {
    for (const input of ["/dot.", "/sys.", "/nextzxos.", "/dot /x", "/ dot /x", "/apps/v1./x", "/apps/x.."]) {
      expect(stored(input)).toBe("installDir.partEnd");
    }
    expect(stored("/NEXTZX~1")).toBe("installDir.invalidCharacters");
    expect(stored("/ dot")).toBe("/ dot");
  });

  it("allows names that only start like a banned directory", () => {
    expect(stored("/system")).toBe("/system");
    expect(stored("/dots/x")).toBe("/dots/x");
    expect(stored("/apps/sys")).toBe("/apps/sys");
  });

  it("allows 64 characters, measured after normalising", () => {
    const dir = `/${"a".repeat(63)}`;
    expect(stored(dir)).toBe(dir);
    expect(stored(`${dir}/`)).toBe(dir);
    expect(stored(`//${"a".repeat(63)}//`)).toBe(dir);
    expect(checkInstallDir(`/${"a".repeat(64)}`)).toEqual({ ok: false, error: { code: "installDir.length", max: 64 } });
  });
});

describe("checkAlias", () => {
  it("accepts a-z, 0-9, - and _, and stores the lowercase form", () => {
    expect(checkAlias("promoted")).toEqual({ ok: true, alias: "promoted" });
    expect(checkAlias("Spun-WiFi_2")).toEqual({ ok: true, alias: "spun-wifi_2" });
  });

  it("refuses other characters, and names each one", () => {
    expect(checkAlias("my app.x")).toEqual({ ok: false, error: { code: "alias.invalidCharacters", chars: [" ", "."] } });
    expect(checkAlias("café")).toEqual({ ok: false, error: { code: "alias.invalidCharacters", chars: ["é"] } });
    expect(checkAlias("a/b")).toEqual({ ok: false, error: { code: "alias.invalidCharacters", chars: ["/"] } });
  });

  it("needs 1 to 16 characters", () => {
    expect(checkAlias("")).toEqual({ ok: false, error: { code: "alias.length", min: 1, max: 16 } });
    expect(checkAlias("a")).toEqual({ ok: true, alias: "a" });
    expect(checkAlias("a".repeat(16))).toEqual({ ok: true, alias: "a".repeat(16) });
    expect(checkAlias("a".repeat(17))).toEqual({ ok: false, error: { code: "alias.length", min: 1, max: 16 } });
  });
});
