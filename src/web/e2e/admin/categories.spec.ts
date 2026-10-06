import { test as base, expect } from "@playwright/test";
import {
  categoryBySlug,
  insertApp,
  insertCategory,
  insertRelease,
  insertUser,
  linkCategory,
  removeCategories,
  removeTestUser,
} from "../support/db";
import { uniqueSlug } from "../support/categories";
import { clickHydrated, uniqueTitle } from "../support/pages";

// Every category that a test makes, in the UI or in the database, is removed
// at the end with its app links; so is every user (with their apps) it inserts.
type Made = { slug(): string; category(): Promise<{ id: number; slug: string }>; user(): Promise<string> };

const test = base.extend<{ made: Made }>({
  made: [
    async ({}, provide) => {
      const slugs: string[] = [];
      const users: string[] = [];
      await provide({
        slug() {
          const slug = uniqueSlug();
          slugs.push(slug);
          return slug;
        },
        async category() {
          const slug = uniqueSlug();
          slugs.push(slug);
          return { id: await insertCategory(slug, `E2E ${slug}`), slug };
        },
        async user() {
          const id = await insertUser(`E2E-${Date.now().toString(36)}`.slice(0, 16));
          users.push(id);
          return id;
        },
      });
      for (const id of users) {
        await removeTestUser(id);
      }
      const rows = await Promise.all(slugs.map(categoryBySlug));
      await removeCategories(rows.flatMap((row) => (row ? [row.id] : [])));
    },
    { timeout: 30_000 },
  ],
});

test("an admin adds, edits, deletes and restores a category; reserved slugs and an app id form are refused", async ({ page, made }) => {
  const slug = made.slug();
  await page.goto("/admin/categories");
  const add = page.getByTestId("category-add");
  // A form action clears the fields after each submit, so each one fills them all.
  const fillAdd = async (slugValue: string, installDir = "/e2e/added", specificity = "3") => {
    await add.getByTestId("category-slug").fill(slugValue);
    await add.getByTestId("category-name").fill("E2E Added");
    await add.getByTestId("category-install-dir").fill(installDir);
    await add.getByTestId("category-specificity").fill(specificity);
    await clickHydrated(add.getByTestId("category-submit"));
  };
  await fillAdd("publish");
  await expect(add.getByTestId("form-error")).toHaveAttribute("data-error", "category.reserved");
  expect(await categoryBySlug("publish")).toBeUndefined();

  await fillAdd("abc123");
  await expect(add.getByTestId("form-error")).toHaveAttribute("data-error", "category.appIdForm");
  expect(await categoryBySlug("abc123")).toBeUndefined();

  await fillAdd("featured");
  await expect(add.getByTestId("form-error")).toHaveAttribute("data-error", "category.reserved");
  expect(await categoryBySlug("featured")).toBeUndefined();

  await fillAdd(slug, "/e2e/added", "-1");
  await expect(add.getByTestId("form-error")).toHaveAttribute("data-error", "category.specificity");
  expect(await categoryBySlug(slug)).toBeUndefined();

  await fillAdd(slug, "/sys/e2e");
  await expect(add.getByTestId("form-error")).toHaveAttribute("data-error", "installDir.banned");
  expect(await categoryBySlug(slug)).toBeUndefined();

  await fillAdd(slug, "e2e\\added\\");
  await expect(add.getByTestId("form-saved")).toBeVisible();
  const added = await categoryBySlug(slug);
  expect(added).toMatchObject({ name: "E2E Added", install_dir: "/e2e/added", specificity: 3, deleted_at: null });

  const edited = made.slug();
  const card = page.getByTestId(`admin-category-${added!.id}`);
  await card.getByTestId("category-slug").fill(edited);
  await card.getByTestId("category-name").fill("E2E Edited");
  await card.getByTestId("category-install-dir").fill("/e2e/edited");
  await card.getByTestId("category-specificity").fill("0");
  await clickHydrated(card.getByTestId("category-submit"));
  await expect(card.getByTestId("form-saved")).toBeVisible();
  expect(await categoryBySlug(slug)).toBeUndefined();
  expect(await categoryBySlug(edited)).toMatchObject({
    id: added!.id,
    name: "E2E Edited",
    install_dir: "/e2e/edited",
    specificity: 0,
  });
  expect((await page.goto(`/catalogue/${edited}`))?.status()).toBe(200);
  expect((await page.goto(`/catalogue/${slug}`))?.status()).toBe(404);

  await page.goto("/admin/categories");
  await card.getByTestId("category-delete").click();
  await expect(card.getByTestId("category-deleted")).toBeVisible();
  expect((await categoryBySlug(edited))?.deleted_at).not.toBeNull();

  await card.getByTestId("category-restore").click();
  await expect(card.getByTestId("category-deleted")).toHaveCount(0);
  expect((await categoryBySlug(edited))?.deleted_at).toBeNull();
});

test("after a category delete, its URL gives not found and the app page does not list it", async ({ page, made }) => {
  const kept = await made.category();
  const gone = await made.category();
  const owner = await made.user();
  const appId = await insertApp(owner, uniqueTitle("CatDelete"));
  await insertRelease(appId, 1, "1.0");
  await linkCategory(appId, kept.id);
  await linkCategory(appId, gone.id);

  await page.goto(`/catalogue/${appId}`);
  await expect(page.getByTestId(`public-app-category-${gone.slug}`)).toBeVisible();
  expect((await page.goto(`/catalogue/${gone.slug}`))?.status()).toBe(200);

  await page.goto("/admin/categories");
  const card = page.getByTestId(`admin-category-${gone.id}`);
  await card.getByTestId("category-delete").click();
  await expect(card.getByTestId("category-deleted")).toBeVisible();

  expect((await page.goto(`/catalogue/${gone.slug}`))?.status()).toBe(404);
  await page.goto(`/catalogue/${appId}`);
  await expect(page.getByTestId(`public-app-category-${kept.slug}`)).toBeVisible();
  await expect(page.getByTestId(`public-app-category-${gone.slug}`)).toHaveCount(0);
});
