import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup, type Browser } from "@playwright/test";
import { appRow, firstLiveCategoryId, insertAppWithId, linkCategory, userByUsername } from "./support/db";
import { nextUid, waitForPin } from "./support/mail";
import { clickHydrated, pathname, uploadRelease, waitForHydration } from "./support/pages";
import { accounts, settings, type Account } from "./support/settings";
import { makeZip, sampleEntries, tempFiles } from "./support/zips";

// Logs in through NBN:ID once per account and saves the browser state. A saved
// state that still shows the user's name on the CMS home is reused, so a normal
// run sends no PIN mail. The NBN:ID pages are not ours: they are found by input
// type, name and role.
//
// After a reset (e2e/reset.mts) the database has no users. The first user to
// log in becomes the admin, so the admin account logs in before the client,
// and each account chooses its username on /username.

async function savedStateIsValid(browser: Browser, account: Account): Promise<boolean> {
  if (!existsSync(account.storageState)) return false;
  const context = await browser.newContext({ storageState: account.storageState });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const name = page.getByTestId("nav-username");
    return (await name.count()) === 1 && (await name.textContent()) === account.username;
  } finally {
    await context.close();
  }
}

for (const account of [accounts.admin, accounts.client]) {
  setup(`log in as ${account.username}`, async ({ browser }) => {
    setup.setTimeout(180_000);
    if (await savedStateIsValid(browser, account)) {
      setup.info().annotations.push({ type: "login", description: "saved state reused" });
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await page.getByTestId("nav-login").click();
    await page.waitForURL((url) => url.href.startsWith(settings.nbnIdUrl));

    await page.locator('input[type="email"][name="login"]').fill(account.email);
    await page.locator('input[type="password"][name="password"]').fill(account.password);
    const fromUid = await nextUid(account);
    const startedAt = new Date();
    await page.locator('button[type="submit"]').click();

    const pinField = page.getByRole("spinbutton");
    await expect(pinField).toBeVisible();
    const pin = await waitForPin(account, fromUid, startedAt);
    await pinField.fill(pin);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => url.href.startsWith(settings.baseUrl), { timeout: 30_000 });
    if (pathname(page) === "/username") {
      await waitForHydration(page.getByTestId("username-submit"));
      await page.getByTestId("username-field").fill(account.username);
      await clickHydrated(page.getByTestId("username-submit"));
      await page.waitForURL((url) => url.pathname === "/");
    }
    await expect(page.getByTestId("nav-username")).toHaveText(account.username);

    mkdirSync(path.dirname(account.storageState), { recursive: true });
    await context.storageState({ path: account.storageState });
    await context.close();
    setup.info().annotations.push({ type: "login", description: "logged in with a new PIN" });
  });
}

// The client's app for the MAME test of .spun (src/client/test), which needs a
// fixed id: the app row goes in directly, and the release is uploaded through
// the CMS. Kept after the run, so the e2e SPUNServer serves it until the next
// reset.
setup("publish the client's test app", async ({ browser }) => {
  if (await appRow(settings.testApp)) {
    setup.info().annotations.push({ type: "test app", description: "already there" });
    return;
  }
  const context = await browser.newContext({ storageState: accounts.client.storageState });
  const page = await context.newPage();
  const files = tempFiles();
  try {
    const client = await userByUsername(accounts.client.username);
    await insertAppWithId(settings.testApp, client.id, "Next Test");
    await linkCategory(settings.testApp, await firstLiveCategoryId());
    await page.goto(`/publish/apps/${settings.testApp}`);
    await uploadRelease(page, { version: "1.0", file: files.write("next-test.zip", makeZip(sampleEntries())) });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${settings.testApp}/releases/1$`));
  } finally {
    files.remove();
    await context.close();
  }
});
