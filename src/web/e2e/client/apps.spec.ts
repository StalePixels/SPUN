import { existsSync } from "node:fs";
import { appRow } from "../support/db";
import { clickHydrated, expect, pathname, releaseFile, test, uniqueTitle, uploadRelease } from "../support/pages";
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

test("the suggested install directory is stored normalised, shown when editing, and can be cleared", async ({
  page,
  apps,
}) => {
  const id = await apps.create("Install dir");
  expect(await appRow(id)).toMatchObject({ install_dir: null });

  await page.getByTestId("app-install-dir").fill("apps\\wifi\\spun\\");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appRow(id)).toMatchObject({ install_dir: "/apps/wifi/spun" });
  await page.reload();
  await expect(page.getByTestId("app-install-dir")).toHaveValue("/apps/wifi/spun");

  await page.getByTestId("app-install-dir").fill("   ");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appRow(id)).toMatchObject({ install_dir: null });
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
  ]) {
    await page.getByTestId("app-install-dir").fill(input);
    await clickHydrated(page.getByTestId("app-submit"));
    await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", code);
    expect(await appRow(id), input).toMatchObject({ install_dir: "/apps/kept" });
  }
});

test("a title with an emoji is refused", async ({ page }) => {
  await page.goto("/publish");
  const title = `${uniqueTitle("Emoji")} 🚀`;
  await page.getByTestId("app-title").fill(title);
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "title.invalidCharacters");
  expect(pathname(page)).toBe("/publish");
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
