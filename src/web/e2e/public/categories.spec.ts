import { test as base, expect, type Page } from "@playwright/test";
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

test("/catalogue/apps and every other category URL show the apps of that category", async ({ page, setup }) => {
  const listed = await listedAppIds(page, "/catalogue/apps");
  expect(listed).toContain(setup.appId);
  expect([...listed].sort()).toEqual((await publicAppIdsIn(setup.apps)).sort());

  const slugs = await page
    .getByTestId(/^category-link-/)
    .evaluateAll((links) => links.map((link) => (link.getAttribute("data-testid") ?? "").replace("category-link-", "")));
  expect(slugs).toContain("apps");
  expect(slugs).toContain(setup.own.slug);
  for (const slug of slugs) {
    const category = await categoryBySlug(slug);
    const ids = await listedAppIds(page, `/catalogue/${slug}`);
    expect([...ids].sort(), slug).toEqual((await publicAppIdsIn(category!.id)).sort());
  }
  expect(await listedAppIds(page, `/catalogue/${setup.own.slug}`)).toEqual([setup.appId]);

  await page.goto(`/catalogue/${setup.own.slug}`);
  await expect(page.getByTestId(`category-link-${setup.own.slug}`)).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("category-link-apps")).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("category-all")).not.toHaveAttribute("aria-current", "page");
  await page.getByTestId("category-all").click();
  await expect(page).toHaveURL((url) => url.pathname === "/catalogue");
  await expect(page.getByTestId("category-all")).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-testid^="category-link-"][aria-current="page"]')).toHaveCount(0);
  const first = await page.getByTestId("category-links").getByRole("link").first().getAttribute("data-testid");
  expect(first).toBe("category-all");
});

test("/catalogue/[id] shows the app page, and an unknown category gives not found", async ({ page, setup }) => {
  await page.goto(`/catalogue/${setup.appId}`);
  await expect(page.getByTestId("public-app-title")).toBeVisible();
  await expect(page.getByTestId("public-app-category-apps")).toBeVisible();
  await expect(page.getByTestId(`public-app-category-${setup.own.slug}`)).toBeVisible();
  expect((await page.goto(`/catalogue/${uniqueSlug()}`))?.status()).toBe(404);
  expect((await page.goto(`/${uniqueSlug()}`))?.status()).toBe(404);
  expect((await page.goto("/catalogue/Apps"))?.status()).toBe(404);
  expect((await page.goto("/Apps"))?.status()).toBe(404);
});

// The path and query a redirect sends to, with no redirect followed.
async function redirectOf(page: Page, url: string): Promise<{ status: number; to: string }> {
  const response = await page.request.get(url, { maxRedirects: 0 });
  const location = new URL(response.headers()["location"] ?? "", "http://x");
  return { status: response.status(), to: `${location.pathname}${location.search}` };
}

test("the old catalogue, category and app URLs redirect permanently, with their query", async ({ page, setup }) => {
  const id = setup.appId;
  const slug = setup.own.slug;
  const moved: [string, string][] = [
    ["/?q=word", "/catalogue?q=word"],
    ["/?page=2", "/catalogue?page=2"],
    ["/?q=word&page=2", "/catalogue?q=word&page=2"],
    [`/${slug}`, `/catalogue/${slug}`],
    [`/${slug}?q=word&page=2`, `/catalogue/${slug}?q=word&page=2`],
    ["/apps", "/catalogue/apps"],
    ["/apps?q=word", "/catalogue/apps?q=word"],
    [`/apps/${id}`, `/catalogue/${id}`],
    [`/apps/${id}/download`, `/catalogue/${id}/download`],
    [`/apps/${id}/screenshots/1?v=5`, `/catalogue/${id}/screenshots/1?v=5`],
    ["/catalog", "/catalogue"],
    ["/catalog?q=word", "/catalogue?q=word"],
    [`/catalog/${slug}?page=2`, `/catalogue/${slug}?page=2`],
    [`/catalog/${id}`, `/catalogue/${id}`],
  ];
  for (const [old, now] of moved) {
    expect(await redirectOf(page, old), old).toEqual({ status: 308, to: now });
  }
  expect((await redirectOf(page, `/${uniqueSlug()}`)).status).toBe(404);
  expect((await redirectOf(page, "/")).status).toBe(200);
});
