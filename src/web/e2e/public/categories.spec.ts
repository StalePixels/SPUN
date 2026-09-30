import { test as base, expect } from "@playwright/test";
import {
  categoryBySlug,
  insertApp,
  insertCategory,
  insertRelease,
  insertUser,
  linkCategory,
  publicAppIdsIn,
  removeCategories,
  removeTestUser,
} from "../support/db";
import { listedAppIds, uniqueSlug } from "../support/categories";
import { uniqueTitle } from "../support/pages";

// The app, its owner and the test category are inserted for this test and
// removed at the end. The apps category is the real one; if the database has
// none, the test makes it and removes it.
type Setup = { owner: string; appId: string; own: { id: number; slug: string }; apps: number };

const test = base.extend<{ setup: Setup }>({
  setup: [
    async ({}, provide) => {
      const made: number[] = [];
      const existing = await categoryBySlug("apps");
      if (existing?.deleted_at) {
        throw new Error("The apps category is deleted. Restore it in /admin/categories.");
      }
      const apps = existing?.id ?? (await insertCategory("apps", "Apps"));
      if (!existing) made.push(apps);
      const slug = uniqueSlug();
      const own = { id: await insertCategory(slug, `E2E ${slug}`), slug };
      made.push(own.id);
      const owner = await insertUser(`E2E-${Date.now().toString(36)}`.slice(0, 16));
      const appId = await insertApp(owner, uniqueTitle("Category"));
      await insertRelease(appId, 1, "1.0");
      await linkCategory(appId, apps);
      await linkCategory(appId, own.id);
      await provide({ owner, appId, own, apps });
      await removeTestUser(owner);
      await removeCategories(made);
    },
    { timeout: 30_000 },
  ],
});

test("/apps and every other category URL show the apps of that category", async ({ page, setup }) => {
  const listed = await listedAppIds(page, "/apps");
  expect(listed).toContain(setup.appId);
  expect([...listed].sort()).toEqual((await publicAppIdsIn(setup.apps)).sort());

  const slugs = await page
    .getByTestId(/^category-link-/)
    .evaluateAll((links) => links.map((link) => (link.getAttribute("data-testid") ?? "").replace("category-link-", "")));
  expect(slugs).toContain("apps");
  expect(slugs).toContain(setup.own.slug);
  for (const slug of slugs) {
    const category = await categoryBySlug(slug);
    const ids = await listedAppIds(page, `/${slug}`);
    expect([...ids].sort(), slug).toEqual((await publicAppIdsIn(category!.id)).sort());
  }
  expect(await listedAppIds(page, `/${setup.own.slug}`)).toEqual([setup.appId]);
});

test("/apps/[id] still shows the app page, and an unknown category gives not found", async ({ page, setup }) => {
  await page.goto(`/apps/${setup.appId}`);
  await expect(page.getByTestId("public-app-title")).toBeVisible();
  await expect(page.getByTestId("public-app-category-apps")).toBeVisible();
  await expect(page.getByTestId(`public-app-category-${setup.own.slug}`)).toBeVisible();
  expect((await page.goto(`/${uniqueSlug()}`))?.status()).toBe(404);
  expect((await page.goto("/Apps"))?.status()).toBe(404);
});
