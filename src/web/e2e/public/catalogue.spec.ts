import { readFileSync } from "node:fs";
import { formatDay, pathname, releaseFile, todayUtc } from "../support/pages";
import { catalogueRow, expect, test } from "../support/publisher";
import { accounts } from "../support/settings";

const client = accounts.client;

// The client may have only one test app live at a time (the default app limit),
// so each case uses the app of the one before it, or a new one after a delete.
test("a published app shows in the catalogue with its latest version; apps that are not public do not", async ({
  page,
  publisher,
}) => {
  const expectNotPublic = async (id: string) => {
    expect(await catalogueRow(page, id), id).toBeNull();
    expect((await page.goto(`/apps/${id}`))?.status(), id).toBe(404);
  };

  const shown = await publisher.create("Shown");
  await publisher.upload(shown, "1.0", 1);
  await publisher.upload(shown, "1.1", 2);
  const row = await catalogueRow(page, shown);
  expect(row, "the published app is in the catalogue").not.toBeNull();
  await expect(row!.getByTestId("catalogue-version")).toHaveText("1.1");
  await expect(row!.getByTestId("catalogue-publisher")).toHaveText(client.username);
  await expect(row!.getByTestId("catalogue-date")).toHaveText(formatDay(todayUtc()));
  await row!.click();
  await expect(page).toHaveURL((url) => url.pathname === `/apps/${shown}`);

  await publisher.deleteApp(shown);
  await expectNotPublic(shown);

  const hidden = await publisher.create("NoRelease");
  await expectNotPublic(hidden);
  await publisher.upload(hidden, "1.0", 1);
  await publisher.deleteRelease(hidden, 1);
  await expectNotPublic(hidden);
});

test("the app page lists the live releases, and not the deleted ones", async ({ page, publisher }) => {
  const id = await publisher.create("Releases", "Public description");
  await publisher.upload(id, "1.0", 1);
  await publisher.upload(id, "1.1", 2);
  await publisher.upload(id, "1.2", 3);
  await publisher.deleteRelease(id, 2);

  await page.goto(`/apps/${id}`);
  await expect(page.getByTestId("public-app-publisher")).toHaveText(client.username);
  await expect(page.getByTestId("public-app-description")).toHaveText("Public description");
  await expect(page.getByTestId("public-app-version")).toHaveText("1.2");
  const listed = await page.getByTestId(/^public-release-\d+$/).evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-testid")),
  );
  expect(listed).toEqual(["public-release-3", "public-release-1"]);
});

test("the download is the latest zip from the data directory; a deleted app gives 404", async ({
  page,
  publisher,
}) => {
  const id = await publisher.create("Download");
  await publisher.upload(id, "1.0", 1);
  await publisher.upload(id, "2.0", 2);

  await page.goto(`/apps/${id}`);
  await expect(page.getByTestId("public-app-download")).toHaveAttribute("href", `/apps/${id}/download`);

  const response = await page.request.get(`/apps/${id}/download`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/zip");
  expect(response.headers()["content-disposition"]).toBe(`attachment; filename="${id}-0002.zip"`);
  expect(Buffer.compare(await response.body(), readFileSync(releaseFile(client.username, id, 2)))).toBe(0);

  await publisher.deleteApp(id);
  expect((await page.request.get(`/apps/${id}/download`)).status()).toBe(404);
});

test("/publish sends an anonymous user to the catalogue, where the navbar has Log in", async ({ page }) => {
  await page.goto("/publish");
  expect(pathname(page)).toBe("/");
  const navbar = page.getByTestId("navbar");
  await expect(navbar.getByTestId("nav-login")).toBeVisible();
  await expect(navbar.getByTestId("nav-publish")).toHaveCount(0);
  await expect(navbar.getByTestId("nav-logout")).toHaveCount(0);
});
