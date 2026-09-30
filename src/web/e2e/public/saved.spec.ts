import { catalogueRow, expect, test } from "../support/publisher";

test("an anonymous user sees no Save button", async ({ page, publisher }) => {
  const id = await publisher.create("NoSave");
  await publisher.upload(id, "1.0", 1);

  expect(await catalogueRow(page, id), "the app is in the catalogue").not.toBeNull();
  await expect(page.getByTestId(/^save-/)).toHaveCount(0);

  await page.goto(`/apps/${id}`);
  await expect(page.getByTestId("public-app-title")).toBeVisible();
  await expect(page.getByTestId(/^save-/)).toHaveCount(0);
});

test("/my sends an anonymous user to log in", async ({ page }) => {
  await page.goto("/my");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByTestId("nav-login")).toBeVisible();
  await expect(page.getByTestId("nav-my")).toHaveCount(0);
});
