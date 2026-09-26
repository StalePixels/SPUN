import { expect, test } from "@playwright/test";
import { userByUsername } from "../support/db";
import { accounts } from "../support/settings";

const client = accounts.client;

test("navbar shows the user, the theme picker and Log out, but no Admin link", async ({ page }) => {
  await page.goto("/");
  const navbar = page.getByTestId("navbar");
  await expect(navbar.getByTestId("nav-username")).toHaveText(client.username);
  await expect(navbar.getByTestId("theme-toggle")).toBeVisible();
  await expect(navbar.getByTestId("nav-logout")).toBeVisible();
  await expect(navbar.getByTestId("nav-admin")).toHaveCount(0);
});

test("admin pages give 404 to a user who is not an admin", async ({ page }) => {
  const { id } = await userByUsername(client.username);
  for (const path of ["/admin", "/admin/settings", "/admin/users", "/admin/apps", `/admin/users/${id}`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
