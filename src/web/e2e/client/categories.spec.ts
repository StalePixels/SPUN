import { test as base } from "@playwright/test";
import { appCategoryIds, insertCategory, removeApps, removeCategories } from "../support/db";
import { listedAppIds, uniqueSlug } from "../support/categories";
import {
  clickHydrated,
  createApp,
  expect,
  pathname,
  uniqueTitle,
  uploadRelease,
} from "../support/pages";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

// The test's categories and app exist only for this test and are removed
// outright at the end.
type Fixture = {
  category(): Promise<{ id: number; slug: string }>;
  app(title: string, slugs: string[]): Promise<string>;
};

const test = base.extend<{ made: Fixture }>({
  made: [
    async ({ page }, provide) => {
      const categories: number[] = [];
      const apps: string[] = [];
      await provide({
        async category() {
          const slug = uniqueSlug();
          const id = await insertCategory(slug, `E2E ${slug}`);
          categories.push(id);
          return { id, slug };
        },
        async app(title, slugs) {
          const id = await createApp(page, title, "", slugs);
          apps.push(id);
          return id;
        },
      });
      await removeApps(apps);
      await removeCategories(categories);
    },
    { timeout: 30_000 },
  ],
});

test("an app needs a category; with two, it shows on both category pages and not on a third", async ({
  page,
  made,
}) => {
  const first = await made.category();
  const second = await made.category();
  const third = await made.category();

  await page.goto("/publish");
  await page.getByTestId("app-title").fill(uniqueTitle("NoCategory"));
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "category.missing");
  expect(pathname(page)).toBe("/publish");

  const id = await made.app(uniqueTitle("TwoCategories"), [first.slug, second.slug]);
  expect(await appCategoryIds(id)).toEqual([first.id, second.id]);

  const files = tempFiles();
  try {
    await uploadRelease(page, { version: "1.0", file: files.write("app.zip", makeZip(sampleEntries())) });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  } finally {
    files.remove();
  }

  expect(await listedAppIds(page, `/${first.slug}`)).toEqual([id]);
  expect(await listedAppIds(page, `/${second.slug}`)).toEqual([id]);
  expect(await listedAppIds(page, `/${third.slug}`)).toEqual([]);

  await page.goto(`/apps/${id}`);
  await expect(page.getByTestId(`public-app-category-${first.slug}`)).toBeVisible();
  await expect(page.getByTestId(`public-app-category-${second.slug}`)).toBeVisible();
  await expect(page.getByTestId(`public-app-category-${third.slug}`)).toHaveCount(0);
});
