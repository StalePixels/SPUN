import { existsSync } from "node:fs";
import { installDirSlug } from "../../src/lib/rules";
import { uniqueSlug } from "../support/categories";
import { appMinCore, appRow, insertCategory, removeApps, removeCategories } from "../support/db";
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

test("create an app, then edit its description and its visibility", async ({ page, apps }) => {
  const id = await apps.create("Create", "First description");
  expect(await appRow(id)).toMatchObject({ deleted_at: null });
  await page.goto(`/publish/apps/${id}/details`);

  await page.getByTestId("app-description").fill("Changed description");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  await expect(page.getByTestId("form-error")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("app-description")).toHaveValue("Changed description");

  await expect(page.getByTestId("app-visibility-listed")).toBeChecked();
  for (const visibility of ["unlisted", "secret"]) {
    await page.getByTestId(`app-visibility-${visibility}`).check();
    await clickHydrated(page.getByTestId("app-submit"));
    await expect(page.getByTestId("form-saved")).toBeVisible();
    expect(await appRow(id)).toMatchObject({ visibility });
    await page.reload();
    await expect(page.getByTestId(`app-visibility-${visibility}`)).toBeChecked();
  }

  await page.goto("/publish");
  await expect(page.getByTestId(`app-${id}`)).toBeVisible();
});

test("the suggested install directory is stored normalised, shown when editing, and cannot be cleared", async ({
  page,
  apps,
}) => {
  const id = await apps.create("Install dir");
  await page.goto(`/publish/apps/${id}/details`);

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

test("the minimum core version is stored as a number, shown as major.minor.sub, refused when wrong, and can be cleared", async ({
  page,
  apps,
}) => {
  const id = await apps.create("Min core");
  await page.goto(`/publish/apps/${id}/details`);
  const input = page.getByTestId("app-min-core");
  expect(await appMinCore(id), "no minimum by default").toBeNull();
  await expect(input).toHaveValue("");

  await input.fill("3.1.10");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appMinCore(id)).toBe(0x03010a);
  await page.reload();
  await expect(input).toHaveValue("3.01.10");

  // Each code differs from the one before, so each wait sees its own submit.
  for (const [value, code] of [
    ["3.01", "minCore.format"],
    ["16.00.00", "minCore.range"],
    ["3.01.256", "minCore.range"],
    ["three", "minCore.format"],
  ]) {
    await input.fill(value);
    await clickHydrated(page.getByTestId("app-submit"));
    await expect(page.getByTestId("form-error"), value).toHaveAttribute("data-error", code);
  }
  expect(await appMinCore(id), "a refused value changes nothing").toBe(0x03010a);

  await input.fill("  ");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appMinCore(id)).toBeNull();
  await page.reload();
  await expect(input).toHaveValue("");
});

test("a new app can be made with a minimum core version", async ({ page }) => {
  await page.goto("/publish/new");
  await page.getByTestId("app-title").fill(uniqueTitle("New core"));
  await waitForHydration(page.getByTestId("app-submit"));
  await page.getByTestId(/^app-category-/).first().check();
  await page.getByTestId("app-min-core").fill("2.00.28");
  await clickHydrated(page.getByTestId("app-submit"));
  await page.waitForURL(/\/publish\/apps\/[0-9a-z]{6}$/);
  const id = pathname(page).split("/").pop()!;
  try {
    expect(await appMinCore(id)).toBe(0x02001c);
    await page.goto(`/publish/apps/${id}/details`);
    await waitForHydration(page.getByTestId("app-submit"));
    await expect(page.getByTestId("app-min-core")).toHaveValue("2.00.28");
  } finally {
    await removeApps([id]);
  }
});

test("the install directory follows the chosen categories and the title until the publisher types in it", async ({ page }) => {
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

    const title = uniqueTitle("Suggested dir");
    await page.getByTestId("app-title").fill(title);
    await expect(dir).toHaveValue(`/e2e/high/${installDirSlug(title)}`);
    await page.getByTestId(`app-category-${low}`).uncheck();
    await expect(dir).toHaveValue(`/e2e/high/${installDirSlug(title)}`);
    await page.getByTestId(`app-category-${long}`).check();
    await expect(dir).toHaveValue(`/e2e/longer/${installDirSlug(title)}`);

    await dir.fill("/e2e/mine");
    await page.getByTestId(`app-category-${low}`).check();
    await page.getByTestId("app-title").fill(uniqueTitle("Suggested dir"));
    await expect(dir).toHaveValue("/e2e/mine");

    await clickHydrated(page.getByTestId("app-submit"));
    await page.waitForURL(/\/publish\/apps\/[0-9a-z]{6}$/);
    const id = pathname(page).split("/").pop()!;
    appIds.push(id);
    expect(await appRow(id)).toMatchObject({ install_dir: "/e2e/mine" });
    await page.goto(`/publish/apps/${id}/details`);
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
  await page.goto(`/publish/apps/${id}/details`);
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

test("a refused app keeps everything typed, and a description of line breaks up to the limit saves", async ({ page }) => {
  // The browser sends each line break as CR LF, which used to push this past the limit.
  const description = `${"x".repeat(63)}\n`.repeat(4);
  expect(description.length).toBe(256);
  const title = uniqueTitle("Kept");
  await page.goto("/publish/new");
  await waitForHydration(page.getByTestId("app-submit"));
  await page.getByTestId("app-title").fill(`${title} 🚀`);
  await page.getByTestId("app-description").fill(description);
  const category = page.getByTestId(/^app-category-/).first();
  await category.check();
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "title.invalidCharacters");
  await expect(page.getByTestId("app-title")).toHaveValue(`${title} 🚀`);
  await expect(page.getByTestId("app-description")).toHaveValue(description);
  await expect(category).toBeChecked();

  await page.getByTestId("app-title").fill(title);
  await clickHydrated(page.getByTestId("app-submit"));
  await page.waitForURL(/\/publish\/apps\/[0-9a-z]{6}$/);
  const id = pathname(page).split("/").pop()!;
  try {
    expect(await appRow(id)).toMatchObject({ title, description });
  } finally {
    await removeApps([id]);
  }
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

  await page.goto(`/publish/apps/${id}/delete`);
  await clickHydrated(page.getByTestId("delete-app"));
  await page.getByTestId("delete-app-confirm").click();

  await expect(page).toHaveURL((url) => url.pathname === "/publish");
  await expect(page.getByTestId(`app-${id}`)).toHaveCount(0);
  expect(existsSync(file)).toBe(false);
  expect((await appRow(id)).deleted_at).not.toBeNull();
  expect((await page.goto(`/publish/apps/${id}`))?.status()).toBe(404);
});
