import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { categories } from "../../src/db/schema";
import { isDuplicateEntry } from "../../src/lib/dberrors";
import { uniqueSlug } from "../support/categories";
import { insertCategory, removeCategories } from "../support/db";
import { settings } from "../support/settings";

// The CMS checks for a taken name first, and the database's unique key catches
// the rest: two requests at once. That catch must see a real duplicate-key
// error as it comes out of Drizzle and the MariaDB driver, the way db() makes it.
test("a real duplicate key from Drizzle and MariaDB reads as a duplicate entry", async () => {
  const slug = uniqueSlug();
  const id = await insertCategory(slug, "E2E duplicate");
  const connection = await mysql.createConnection(settings.databaseUrl);
  try {
    const error = await drizzle(connection, { mode: "default" })
      .insert(categories)
      .values({ slug: slug.toUpperCase(), name: "E2E duplicate again", installDir: "/e2e/duplicate" })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(error, "the insert must fail on the unique key").not.toBeNull();
    expect(isDuplicateEntry(error)).toBe(true);
    expect((error as { code?: unknown }).code, "the code is on the cause, not on the error").toBeUndefined();

    const other = await drizzle(connection, { mode: "default" })
      .update(categories)
      .set({ name: "x".repeat(300) })
      .where(eq(categories.id, id))
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(other, "a value too long for its column must fail").not.toBeNull();
    expect(isDuplicateEntry(other)).toBe(false);
  } finally {
    await connection.end();
    await removeCategories([id]);
  }
});
