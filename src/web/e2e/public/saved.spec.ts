import { catalogueRow, expect, test } from "../support/publisher";

test("an anonymous user sees no Save button", async ({ page, publisher }) => {
  const id = await publisher.create("NoSave");
  await publisher.upload(id, "1.0", 1);

  expect(await catalogueRow(page, id), "the app is in the catalogue").not.toBeNull();
  await expect(page.getByTestId(/^save-/)).toHaveCount(0);

  await page.goto(`/catalogue/${id}`);
  await expect(page.getByTestId("public-app-title")).toBeVisible();
  await expect(page.getByTestId(/^save-/)).toHaveCount(0);
});

test("/me/apps and the old /my send an anonymous user to log in", async ({ page }) => {
  for (const path of ["/me/apps", "/my"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByTestId("nav-login"), path).toBeVisible();
  }
});
