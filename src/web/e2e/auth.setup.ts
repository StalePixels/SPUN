import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup, type Browser } from "@playwright/test";
import { nextUid, waitForPin } from "./support/mail";
import { accounts, settings, type Account } from "./support/settings";

// Logs in through NBN:ID once per account and saves the browser state. A saved
// state that still shows the user's name on the CMS home is reused, so a normal
// run sends no PIN mail. The NBN:ID pages are not ours: they are found by input
// type, name and role.

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

for (const account of Object.values(accounts)) {
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
    await expect(page.getByTestId("nav-username")).toHaveText(account.username);

    mkdirSync(path.dirname(account.storageState), { recursive: true });
    await context.storageState({ path: account.storageState });
    await context.close();
    setup.info().annotations.push({ type: "login", description: "logged in with a new PIN" });
  });
}
