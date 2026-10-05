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

test("the publish menu links its three pages and marks the current one", async ({ page }) => {
  const pages = [
    { key: "apps", path: "/publish", shows: "publish-menu" },
    { key: "new", path: "/publish/new", shows: "app-submit" },
    { key: "docs", path: "/publish/docs", shows: "docs-zip-macos" },
  ];
  await page.goto("/publish");
  for (const { key, path, shows } of pages) {
    await page.getByTestId(`publish-menu-${key}`).click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.getByTestId(shows), path).toBeVisible();
    for (const other of pages) {
      const entry = page.getByTestId(`publish-menu-${other.key}`);
      if (other.key === key) await expect(entry, path).toHaveAttribute("aria-current", "page");
      else await expect(entry, path).not.toHaveAttribute("aria-current", "page");
    }
  }
  for (const id of ["docs-rules", "docs-zip-linux", "docs-zip-wsl"]) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  await expect(page.getByTestId("app-submit")).toHaveCount(0);
});

test("the account menu links its three tabs and marks the current one; /my and /keys redirect for good", async ({
  page,
}) => {
  const pages = [
    { key: "account", path: "/me", shows: "me-heading" },
    { key: "apps", path: "/me/apps", shows: "my-heading" },
    { key: "keys", path: "/me/keys", shows: "keys-heading" },
  ];
  await page.goto("/me");
  for (const { key, path, shows } of pages) {
    await page.getByTestId(`me-menu-${key}`).click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.getByTestId(shows), path).toBeVisible();
    for (const other of pages) {
      const entry = page.getByTestId(`me-menu-${other.key}`);
      if (other.key === key) await expect(entry, path).toHaveAttribute("aria-current", "page");
      else await expect(entry, path).not.toHaveAttribute("aria-current", "page");
    }
  }
  await page.goto("/me");
  await expect(page.getByTestId("me-keys")).toHaveCount(0);
  await expect(page.getByTestId("navbar").getByTestId("nav-my")).toHaveCount(0);

  for (const [old, now] of [
    ["/my", "/me/apps"],
    ["/keys", "/me/keys"],
  ]) {
    const response = await page.request.get(old, { maxRedirects: 0 });
    expect(response.status(), old).toBe(308);
    expect(new URL(response.headers()["location"], "http://x").pathname, old).toBe(now);
  }
});
