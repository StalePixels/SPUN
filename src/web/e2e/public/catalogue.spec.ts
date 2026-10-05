import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { insertAlias, liveCategorySlugs } from "../support/db";
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
    expect((await page.goto(`/catalogue/${id}`))?.status(), id).toBe(404);
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
  await expect(page).toHaveURL((url) => url.pathname === `/catalogue/${shown}`);

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

  await page.goto(`/catalogue/${id}`);
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

  await page.goto(`/catalogue/${id}`);
  await expect(page.getByTestId("public-app-download")).toHaveAttribute("href", `/catalogue/${id}/download`);

  const response = await page.request.get(`/catalogue/${id}/download`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/zip");
  expect(response.headers()["content-disposition"]).toBe(`attachment; filename="${id}-0002.zip"`);
  expect(Buffer.compare(await response.body(), readFileSync(releaseFile(client.username, id, 2)))).toBe(0);

  await publisher.deleteApp(id);
  expect((await page.request.get(`/catalogue/${id}/download`)).status()).toBe(404);
});

test("/publish sends an anonymous user to the front page, where the navbar has Log in", async ({ page }) => {
  await page.goto("/publish");
  expect(pathname(page)).toBe("/");
  const navbar = page.getByTestId("navbar");
  await expect(navbar.getByTestId("nav-login")).toBeVisible();
  await expect(navbar.getByTestId("nav-publish")).toHaveCount(0);
  await expect(navbar.getByTestId("nav-logout")).toHaveCount(0);
});

test("the home page links to the zip of the app that the alias spun points to, only while it has a release", async ({
  page,
  publisher,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("get-spun")).toHaveCount(0);
  await page.getByTestId("home-catalogue").click();
  await expect(page).toHaveURL((url) => url.pathname === "/catalogue");
  await expect(page.getByTestId("catalogue-heading")).toBeVisible();

  const id = await publisher.create("Spun");
  await publisher.upload(id, "1.0", 1);
  await insertAlias("spun", id);

  await page.goto("/");
  await expect(page.getByTestId("get-spun-download")).toHaveAttribute("href", `/catalogue/${id}/download`);
  await expect(page.getByTestId("get-spun-nbnget")).toContainText(".nbnget /dot/spun : ../spun get spun");
  const response = await page.request.get(`/catalogue/${id}/download`);
  expect(response.status()).toBe(200);
  expect(Buffer.compare(await response.body(), readFileSync(releaseFile(client.username, id, 1)))).toBe(0);

  const [slug] = await liveCategorySlugs();
  await page.goto(`/catalogue/${slug}`);
  await expect(page.getByTestId("catalogue-heading")).toBeVisible();
  await expect(page.getByTestId("get-spun")).toHaveCount(0);

  await publisher.deleteRelease(id, 1);
  await page.goto("/");
  await expect(page.getByTestId("get-spun")).toHaveCount(0);
});

test("/publish/new and /publish/docs send an anonymous user to the front page", async ({ page }) => {
  for (const path of ["/publish/new", "/publish/docs"]) {
    await page.goto(path);
    expect(pathname(page), path).toBe("/");
    await expect(page.getByTestId("publish-menu"), path).toHaveCount(0);
  }
});

test("/get/<alias or id> sends to the app page for a public app only, and is not permanent", async ({ page, publisher }) => {
  const id = await publisher.create("Get");
  const alias = `get${randomBytes(4).toString("hex")}`;
  const statusOf = async (name: string) => (await page.request.get(`/get/${name}`, { maxRedirects: 0 })).status();

  expect(await statusOf(id), "an app with no release is not public").toBe(404);
  await publisher.upload(id, "1.0", 1);
  await insertAlias(alias, id);
  for (const name of [id, id.toUpperCase(), alias, alias.toUpperCase()]) {
    const response = await page.request.get(`/get/${name}`, { maxRedirects: 0 });
    expect(response.status(), name).toBe(307);
    expect(new URL(response.headers()["location"], "http://x").pathname, name).toBe(`/catalogue/${id}`);
  }
  await page.goto(`/get/${alias}`);
  await expect(page.getByTestId("public-app-title")).toBeVisible();

  expect(await statusOf(`no${randomBytes(4).toString("hex")}`)).toBe(404);
  await publisher.deleteRelease(id, 1);
  expect(await statusOf(alias)).toBe(404);
  expect(await statusOf(id)).toBe(404);
});

test("the navbar brand goes to the front page and Catalogue to the catalogue", async ({ page }) => {
  await page.goto("/catalogue");
  const navbar = page.getByTestId("navbar");
  await navbar.getByTestId("nav-brand").click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await navbar.getByTestId("nav-catalogue").click();
  await expect(page).toHaveURL((url) => url.pathname === "/catalogue");
  await expect(page.getByTestId("catalogue-heading")).toBeVisible();
});
