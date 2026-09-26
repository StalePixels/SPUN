import { existsSync } from "node:fs";
import { appRow } from "../support/db";
import { expect, pathname, releaseFile, test, uniqueTitle, uploadRelease } from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

test("create an app, then edit its description", async ({ page, apps }) => {
  const id = await apps.create("Create", "First description");
  expect(await appRow(id)).toMatchObject({ deleted_at: null });

  await page.getByTestId("app-description").fill("Changed description");
  await page.getByTestId("app-submit").click();
  await expect(page.getByTestId("form-saved")).toBeVisible();
  await expect(page.getByTestId("form-error")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("app-description")).toHaveValue("Changed description");

  await page.goto("/");
  await expect(page.getByTestId(`app-${id}`)).toBeVisible();
});

test("a title with an emoji is refused", async ({ page }) => {
  await page.goto("/");
  const title = `${uniqueTitle("Emoji")} 🚀`;
  await page.getByTestId("app-title").fill(title);
  await page.getByTestId("app-submit").click();
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "title.invalidCharacters");
  expect(pathname(page)).toBe("/");
});

test("delete an app: files go, the database row stays marked deleted", async ({ page, apps }) => {
  const id = await apps.create("Delete");
  const files = tempFiles();
  try {
    await uploadRelease(page, {
      version: "1.0",
      file: files.write("app.zip", makeZip(sampleEntries())),
    });
    await expect(page).toHaveURL(new RegExp(`/apps/${id}/releases/1$`));
  } finally {
    files.remove();
  }
  const file = releaseFile(client.username, id, 1);
  expect(existsSync(file)).toBe(true);

  await page.goto(`/apps/${id}`);
  await page.getByTestId("delete-app").click();
  await page.getByTestId("delete-app-confirm").click();

  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByTestId(`app-${id}`)).toHaveCount(0);
  expect(existsSync(file)).toBe(false);
  expect((await appRow(id)).deleted_at).not.toBeNull();
  expect((await page.goto(`/apps/${id}`))?.status()).toBe(404);
});
