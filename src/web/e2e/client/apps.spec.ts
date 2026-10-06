import { existsSync } from "node:fs";
import { uniqueSlug } from "../support/categories";
import { appRow, insertCategory, removeApps, removeCategories } from "../support/db";
import {
  clickHydrated,
  expect,
  pathname,
  releaseFile,
  skipAppFormChecks,
  test,
  uniqueTitle,
  uploadRelease,
  waitForHydration,
} from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

test("create an app, then edit its description", async ({ page, apps }) => {
  const id = await apps.create("Create", "First description");
  expect(await appRow(id)).toMatchObject({ deleted_at: null });

  await page.getByTestId("app-description").fill("Changed description");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  await expect(page.getByTestId("form-error")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("app-description")).toHaveValue("Changed description");

  await page.goto("/publish");
  await expect(page.getByTestId(`app-${id}`)).toBeVisible();
});

test("the suggested install directory is stored normalised, shown when editing, and cannot be cleared", async ({
  page,
  apps,
}) => {
  const id = await apps.create("Install dir");

  await page.getByTestId("app-install-dir").fill("apps\\wifi\\spun\\");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appRow(id)).toMatchObject({ install_dir: "/apps/wifi/spun" });
  await page.reload();
  await expect(page.getByTestId("app-install-dir")).toHaveValue("/apps/wifi/spun");

  await skipAppFormChecks(page);
  await page.getByTestId("app-install-dir").fill("   ");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "installDir.missing");
  expect(await appRow(id)).toMatchObject({ install_dir: "/apps/wifi/spun" });
});

test("the install directory follows the chosen categories until the publisher types in it", async ({ page }) => {
  const [low, long, high] = [uniqueSlug(), uniqueSlug(), uniqueSlug()];
  const categoryIds = [
    await insertCategory(low, `E2E ${low}`, "/e2e/low/longest", 1),
    await insertCategory(long, `E2E ${long}`, "/e2e/longer", 2),
    await insertCategory(high, `E2E ${high}`, "/e2e/high", 2),
  ];
  const appIds: string[] = [];
  try {
    await page.goto("/publish/new");
    await waitForHydration(page.getByTestId("app-submit"));
    const dir = page.getByTestId("app-install-dir");
    await expect(dir).toHaveValue("");

    // Highest specificity wins; on a tie, the longest directory.
    await page.getByTestId(`app-category-${low}`).check();
    await expect(dir).toHaveValue("/e2e/low/longest");
    await page.getByTestId(`app-category-${high}`).check();
    await expect(dir).toHaveValue("/e2e/high");
    await page.getByTestId(`app-category-${long}`).check();
    await expect(dir).toHaveValue("/e2e/longer");
    await page.getByTestId(`app-category-${long}`).uncheck();
    await expect(dir).toHaveValue("/e2e/high");

    await dir.fill("/e2e/mine");
    await page.getByTestId(`app-category-${long}`).check();
    await expect(dir).toHaveValue("/e2e/mine");

    await page.getByTestId("app-title").fill(uniqueTitle("Suggested dir"));
    await clickHydrated(page.getByTestId("app-submit"));
    await page.waitForURL(/\/publish\/apps\/[0-9a-z]{6}$/);
    const id = pathname(page).split("/").pop()!;
    appIds.push(id);
    expect(await appRow(id)).toMatchObject({ install_dir: "/e2e/mine" });
    await waitForHydration(page.getByTestId("app-submit"));
    await expect(dir, "a stored directory is not replaced by a category change").toHaveValue("/e2e/mine");
    await page.getByTestId(`app-category-${low}`).uncheck();
    await expect(dir).toHaveValue("/e2e/mine");
  } finally {
    await removeApps(appIds);
    await removeCategories(categoryIds);
  }
});

test("a banned install directory and a drive letter are refused and change nothing", async ({ page, apps }) => {
  const id = await apps.create("Install dir bad");
  await page.getByTestId("app-install-dir").fill("/apps/kept");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();

  // Each code differs from the one before, so each wait sees its own submit.
  for (const [input, code] of [
    ["/SYS/foo", "installDir.banned"],
    ["C:\\apps", "installDir.drive"],
    ["/", "installDir.banned"],
    ["/dot.", "installDir.partEnd"],
    ["/machines/next", "installDir.banned"],
  ]) {
    await page.getByTestId("app-install-dir").fill(input);
    await clickHydrated(page.getByTestId("app-submit"));
    await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", code);
    expect(await appRow(id), input).toMatchObject({ install_dir: "/apps/kept" });
  }
});

test("a title with an emoji is refused", async ({ page }) => {
  await page.goto("/publish/new");
  const title = `${uniqueTitle("Emoji")} 🚀`;
  await page.getByTestId("app-title").fill(title);
  await waitForHydration(page.getByTestId("app-submit"));
  await page.getByTestId(/^app-category-/).first().check();
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "title.invalidCharacters");
  expect(pathname(page)).toBe("/publish/new");
});

test("delete an app: files go, the database row stays marked deleted", async ({ page, apps }) => {
  const id = await apps.create("Delete");
  const files = tempFiles();
  try {
    await uploadRelease(page, {
      version: "1.0",
      file: files.write("app.zip", makeZip(sampleEntries())),
    });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  } finally {
    files.remove();
  }
  const file = releaseFile(client.username, id, 1);
  expect(existsSync(file)).toBe(true);

  await page.goto(`/publish/apps/${id}`);
  await clickHydrated(page.getByTestId("delete-app"));
  await page.getByTestId("delete-app-confirm").click();

  await expect(page).toHaveURL((url) => url.pathname === "/publish");
  await expect(page.getByTestId(`app-${id}`)).toHaveCount(0);
  expect(existsSync(file)).toBe(false);
  expect((await appRow(id)).deleted_at).not.toBeNull();
  expect((await page.goto(`/publish/apps/${id}`))?.status()).toBe(404);
});
