import { userByUsername } from "../support/db";
import { expect, test, uploadRelease } from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

test("navbar shows the user, the theme picker, Publishers and Log out, but no Admin link or Log in", async ({ page }) => {
  await page.goto("/");
  const navbar = page.getByTestId("navbar");
  await expect(navbar.getByTestId("nav-username")).toHaveText(client.username);
  await expect(navbar.getByTestId("theme-toggle")).toBeVisible();
  await expect(navbar.getByTestId("nav-logout")).toBeVisible();
  await expect(navbar.getByTestId("nav-admin")).toHaveCount(0);
  await expect(navbar.getByTestId("nav-login")).toHaveCount(0);

  await navbar.getByTestId("nav-publish").click();
  await expect(page).toHaveURL((url) => url.pathname === "/publish");
});

test("admin pages give 404 to a user who is not an admin", async ({ page }) => {
  const { id } = await userByUsername(client.username);
  for (const path of ["/admin", "/admin/settings", "/admin/users", "/admin/apps", `/admin/users/${id}`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("the admin app and release pages give 404 to a user who is not an admin", async ({ page, apps }) => {
  const id = await apps.create("NoAdmin");
  const files = tempFiles();
  try {
    await page.goto(`/publish/apps/${id}`);
    await uploadRelease(page, { version: "1.0", file: files.write("1.0.zip", makeZip(sampleEntries())) });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  } finally {
    files.remove();
  }
  for (const path of [`/admin/apps/${id}`, `/admin/apps/${id}/releases/1`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
