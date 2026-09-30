import { listedAppIds } from "../support/categories";
import { pathname } from "../support/pages";
import { expect, test } from "../support/searchData";

test("a search finds an app by a word in its title or its description, and not a deleted app", async ({
  page,
  data,
}) => {
  await page.goto("/");
  await page.getByTestId("catalogue-search-input").fill(data.titleWord);
  await page.getByTestId("catalogue-search-submit").click();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("q") === data.titleWord);
  await expect(page.getByTestId("catalogue-search-input")).toHaveValue(data.titleWord);
  const found = await page
    .getByTestId(/^catalogue-app-/)
    .evaluateAll((rows) => rows.map((row) => (row.getAttribute("data-testid") ?? "").replace("catalogue-app-", "")));
  expect(found).toEqual([data.inOne.id, data.inTwo.id]);

  expect(await listedAppIds(page, `/?q=${data.titleWord.toUpperCase()}`), "the search ignores case").toEqual([
    data.inOne.id,
    data.inTwo.id,
  ]);
  expect(await listedAppIds(page, `/?q=${data.descriptionWord}`)).toEqual([data.inOne.id]);
});

test("a search on a category page finds only apps in that category", async ({ page, data }) => {
  await page.goto(`/${data.two.slug}`);
  await page.getByTestId("catalogue-search-input").fill(data.titleWord);
  await page.getByTestId("catalogue-search-submit").click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === data.titleWord);
  expect(pathname(page)).toBe(`/${data.two.slug}`);

  expect(await listedAppIds(page, `/${data.two.slug}?q=${data.titleWord}`)).toEqual([data.inTwo.id]);
  expect(await listedAppIds(page, `/${data.one.slug}?q=${data.titleWord}`)).toEqual([data.inOne.id]);
  expect(await listedAppIds(page, `/${data.two.slug}?q=${data.descriptionWord}`)).toEqual([]);
});
