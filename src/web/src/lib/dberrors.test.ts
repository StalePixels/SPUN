import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { isDuplicateEntry } from "./dberrors";

const driverError = (code: string) => Object.assign(new Error(code), { code, errno: code === "ER_DUP_ENTRY" ? 1062 : 1 });

describe("isDuplicateEntry", () => {
  it("sees a duplicate key in the driver error that Drizzle wraps", () => {
    expect(isDuplicateEntry(new DrizzleQueryError("insert", [], driverError("ER_DUP_ENTRY")))).toBe(true);
  });

  it("ignores other database errors and things that are not errors", () => {
    expect(isDuplicateEntry(new DrizzleQueryError("insert", [], driverError("ER_NO_REFERENCED_ROW_2")))).toBe(false);
    expect(isDuplicateEntry(new Error("boom"))).toBe(false);
    expect(isDuplicateEntry(null)).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
  });
});
