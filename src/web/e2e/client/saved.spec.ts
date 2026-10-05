import { appRow, isSaved, userByUsername } from "../support/db";
import { clickHydrated } from "../support/pages";
import { catalogueRow, expect, test } from "../support/publisher";
import { accounts } from "../support/settings";

// One app, as the client may have only one test app live at a time. The admin
// restore runs in a second browser context with the admin login.
test("save from the catalogue and the app page, list on /me/apps, remove; a deleted app leaves the list until restored", async ({
  page,
  publisher,
  browser,
}) => {
  const client = await userByUsername(accounts.client.username);
  const id = await publisher.create("Saved");
  await publisher.upload(id, "1.0", 1);
  const save = page.getByTestId(`save-${id}`);
  const onMy = page.getByTestId(`catalogue-app-${id}`);

  expect(await catalogueRow(page, id), "the app is in the catalogue").not.toBeNull();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await clickHydrated(save);
  await expect(save).toHaveAttribute("aria-pressed", "true");
  expect(await isSaved(client.id, id)).toBe(true);

  await page.goto("/me");
  await page.getByTestId("me-menu-apps").click();
  await expect(page).toHaveURL((url) => url.pathname === "/me/apps");
  await expect(onMy).toBeVisible();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await clickHydrated(save);
  await expect(onMy).toHaveCount(0);
  expect(await isSaved(client.id, id)).toBe(false);

  await page.goto(`/catalogue/${id}`);
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await clickHydrated(save);
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me/apps");
  await expect(onMy).toBeVisible();

  await publisher.deleteApp(id);
  await page.goto("/me/apps");
  await expect(page.getByTestId("my-heading")).toBeVisible();
  await expect(onMy).toHaveCount(0);
  expect(await isSaved(client.id, id), "the row stays for a deleted app").toBe(true);

  const context = await browser.newContext({ storageState: accounts.admin.storageState });
  try {
    const admin = await context.newPage();
    await admin.goto(`/admin/apps/${id}`);
    await clickHydrated(admin.getByTestId("restore-app"));
    await expect(admin.getByTestId("admin-app-deleted-note")).toHaveCount(0);
  } finally {
    await context.close();
  }
  expect((await appRow(id))?.deleted_at).toBeNull();
  await page.goto("/me/apps");
  await expect(onMy).toBeVisible();
});
