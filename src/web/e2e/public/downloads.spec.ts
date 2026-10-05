import { setAppDownloads } from "../support/db";
import { catalogueRow } from "../support/publisher";
import { expect, test } from "../support/searchData";

// The number is set straight in the database: the web does not count its own
// downloads, and SPUNServer counts them only from Phase 7.
test("the app page, its Markdown copy and the catalogue row show the download total", async ({ page, data }) => {
  const id = data.inOne.id;
  await setAppDownloads(id, 4321);

  await page.goto(`/catalogue/${id}`);
  await expect(page.getByTestId("public-app-downloads")).toHaveText("4321");

  const row = await catalogueRow(page, id);
  expect(row, "the app is in the catalogue").not.toBeNull();
  await expect(row!.getByTestId("catalogue-downloads")).toHaveText("4321");

  const markdown = await (await page.request.get(`/catalogue/${id}.md`)).text();
  expect(markdown.split("\n")).toContain("- Download count: 4321");
});
