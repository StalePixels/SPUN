import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { clientLogNames, insertClientLog, removeClientLog, type ClientLogRow } from "../support/db";
import { test as base, expect, waitForHydration } from "../support/pages";
import { accounts } from "../support/settings";

// Client statistics on client_log rows the test inserts under its own keys, so
// rows from .spun test runs do not change the numbers. The rows go at the end.

type Keys = { main: string; old: string };

const test = base.extend<{ keys: Keys }>({
  keys: [
    async ({}, provide) => {
      const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      const keys = { main: `e2e${stamp}`, old: `e2e${stamp}old` };
      const ids = Array.from({ length: 8 }, () => randomUUID());
      const row = (daysAgo: number, id: number, address: string | null, value: string, name = keys.main): ClientLogRow => ({
        daysAgo,
        connectionId: ids[id],
        address,
        name,
        value,
      });
      await insertClientLog([
        // Today: one address with two connections (one logs twice), and a second address.
        row(0, 0, "10.0.0.1", "1.0"),
        row(0, 0, "10.0.0.1", "1.0"),
        row(0, 1, "10.0.0.1", "1.0"),
        row(0, 2, "10.0.0.2", "2.0"),
        // Yesterday: the first address again, and a connection with no address.
        row(1, 3, "10.0.0.1", "1.0"),
        row(1, 4, null, "1.0"),
        // Inside 90 days but not 30, and inside 365 but not 90.
        row(40, 5, "10.0.0.3", "2.0"),
        row(200, 6, "10.0.0.4", "3.0"),
        // A key with rows only before the 90-day range.
        row(100, 7, "10.0.0.5", "9.9", keys.old),
      ]);
      await provide(keys);
      await removeClientLog([keys.main, keys.old]);
    },
    { timeout: 30_000 },
  ],
});

async function expectTotals(page: Page, totals: Record<string, number>): Promise<void> {
  await expect(page.getByTestId("stats-row")).toHaveCount(Object.keys(totals).length);
  for (const [value, total] of Object.entries(totals)) {
    await expect(page.getByTestId(`stats-total-${value}`)).toHaveText(String(total));
  }
}

test("the Admin page links to the client statistics", async ({ page }) => {
  await page.goto("/admin");
  await page.getByTestId("admin-link-clients").click();
  await expect(page).toHaveURL(/\/admin\/clients$/);
});

test("the key defaults to version, or else the first key", async ({ page, keys }) => {
  const names = await clientLogNames();
  expect(names).toContain(keys.main);
  await page.goto("/admin/clients");
  await expect(page.getByTestId("stats-key")).toHaveValue(names.includes("version") ? "version" : names[0]);
});

test("both measures count per UTC day over the chosen range", async ({ page, keys }) => {
  await page.goto(`/admin/clients?key=${keys.main}`);
  await expect(page.getByTestId("stats-key")).toHaveValue(keys.main);
  // The default: unique addresses per day over 90 days. 1.0 has 10.0.0.1 on two days.
  await expectTotals(page, { "1.0": 2, "2.0": 2 });

  await waitForHydration(page.getByTestId("stats-measure-connections"));
  await page.getByTestId("stats-measure-connections").click();
  await expect(page).toHaveURL(/measure=connections/);
  // Three connections today and two yesterday, one of them with no address.
  await expectTotals(page, { "1.0": 4, "2.0": 2 });

  await page.getByTestId("stats-range-30").click();
  await expect(page).toHaveURL(/range=30/);
  await expectTotals(page, { "1.0": 4, "2.0": 1 });

  await page.getByTestId("stats-measure-addresses").click();
  await expect(page).toHaveURL(/measure=addresses/);
  await expectTotals(page, { "1.0": 2, "2.0": 1 });

  await page.getByTestId("stats-range-365").click();
  await expect(page).toHaveURL(/range=365/);
  await expectTotals(page, { "1.0": 2, "2.0": 2, "3.0": 1 });

  // The view is in the URL, so it can be linked.
  await page.goto(`/admin/clients?key=${keys.main}&measure=connections&range=30`);
  await expectTotals(page, { "1.0": 4, "2.0": 1 });
});

test("choosing a key shows its values, and a range with no rows is empty", async ({ page, keys }) => {
  await page.goto(`/admin/clients?key=${keys.main}`);
  await waitForHydration(page.getByTestId("stats-key"));
  await page.getByTestId("stats-key").selectOption(keys.old);
  await expect(page).toHaveURL(new RegExp(`key=${keys.old}`));
  await expect(page.getByTestId("stats-empty")).toBeVisible();
  await expect(page.getByTestId("stats-table")).toHaveCount(0);

  await page.getByTestId("stats-range-365").click();
  await expect(page).toHaveURL(/range=365/);
  await expect(page.getByTestId("stats-empty")).toHaveCount(0);
  await expectTotals(page, { "9.9": 1 });
});

test("a user who is not an admin gets not found", async ({ browser }) => {
  const context = await browser.newContext({ storageState: accounts.client.storageState });
  try {
    const page = await context.newPage();
    expect((await page.goto("/admin/clients"))?.status()).toBe(404);
  } finally {
    await context.close();
  }
});
