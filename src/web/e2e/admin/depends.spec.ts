import { dependsOf, insertApp, insertDepends, insertRelease, insertUser, markAppDeleted, removeTestUser } from "../support/db";
import { clickHydrated, expect, test, uniqueTitle } from "../support/pages";

test("an app's page lists the apps that depend on it, deleted ones too", async ({ page }) => {
  const userId = await insertUser(`e2en${Date.now().toString(36).slice(-8)}`);
  try {
    const needed = await insertApp(userId, uniqueTitle("Needed"));
    const live = await insertApp(userId, uniqueTitle("Group"));
    const gone = await insertApp(userId, uniqueTitle("Old group"));
    await insertDepends(live, needed);
    await insertDepends(gone, needed);
    await markAppDeleted(gone);

    await page.goto(`/admin/apps/${needed}`);
    await expect(page.getByTestId(`needed-by-${live}`)).toBeVisible();
    await expect(page.getByTestId(`needed-by-${gone}`)).toContainText("Deleted");
    await expect(page.getByTestId("needed-by-none")).toHaveCount(0);

    await page.goto(`/admin/apps/${live}`);
    await expect(page.getByTestId("needed-by-none")).toBeVisible();
  } finally {
    await removeTestUser(userId);
  }
});

test("an admin edits another user's dependency list with the picker", async ({ page }) => {
  const userId = await insertUser(`e2ea${Date.now().toString(36).slice(-8)}`);
  try {
    const group = await insertApp(userId, uniqueTitle("Admin group"));
    const part = await insertApp(userId, uniqueTitle("Admin part"));
    const shared = await insertApp(userId, uniqueTitle("Admin shared"));
    await insertRelease(shared, 1, "1.0");
    const card = page.getByTestId("depends");

    await page.goto(`/admin/apps/${group}`);
    await expect(card.getByTestId(`depends-own-${group}`)).toHaveCount(0);
    await clickHydrated(card.getByTestId(`depends-own-${part}`));
    await card.getByTestId("depends-search").fill(shared);
    await card.getByTestId("depends-search-submit").click();
    await card.getByTestId(`depends-add-${shared}`).click();
    await expect(card.getByTestId(`depends-own-${shared}`)).toHaveAttribute("aria-pressed", "true");
    await card.getByTestId("depends-submit").click();
    await expect(card.getByTestId("form-saved")).toBeVisible();
    expect(await dependsOf(group)).toEqual([part, shared].sort());

    await page.reload();
    await expect(card.getByTestId(`depends-picked-${part}`)).toBeVisible();
    await page.goto(`/admin/apps/${part}`);
    await expect(page.getByTestId(`needed-by-${group}`)).toBeVisible();
  } finally {
    await removeTestUser(userId);
  }
});
