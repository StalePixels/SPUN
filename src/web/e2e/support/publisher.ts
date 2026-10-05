import type { Locator, Page } from "@playwright/test";
import { removeApps } from "./db";
import {
  clickHydrated,
  createApp,
  deleteAppInUi,
  expect,
  test as base,
  uniqueTitle,
  uploadRelease,
} from "./pages";
import { accounts } from "./settings";
import { makeZip, sampleEntries, tempFiles } from "./zips";

// For the public project. The test's own page has no login; the publisher is
// the client account in a second browser context. Apps it creates are removed
// outright at the end, as with the apps fixture.

export type Publisher = {
  create(label: string, description?: string): Promise<string>;
  upload(appId: string, version: string, serial: number): Promise<void>;
  deleteRelease(appId: string, serial: number): Promise<void>;
  deleteApp(appId: string): Promise<void>;
};

export const test = base.extend<{ publisher: Publisher }>({
  publisher: [
    async ({ browser }, provide) => {
      const context = await browser.newContext({ storageState: accounts.client.storageState });
      const page = await context.newPage();
      const files = tempFiles();
      const created: string[] = [];
      await provide({
        async create(label, description) {
          const id = await createApp(page, uniqueTitle(label), description);
          created.push(id);
          return id;
        },
        async upload(appId, version, serial) {
          await page.goto(`/publish/apps/${appId}`);
          await uploadRelease(page, { version, file: files.write(`${appId}-${version}.zip`, makeZip(sampleEntries())) });
          await expect(page).toHaveURL(new RegExp(`/publish/apps/${appId}/releases/${serial}$`));
        },
        async deleteRelease(appId, serial) {
          await page.goto(`/publish/apps/${appId}/releases/${serial}`);
          await clickHydrated(page.getByTestId("delete-release"));
          await page.getByTestId("delete-release-confirm").click();
          await expect(page.getByTestId("release-deleted")).toBeVisible();
        },
        async deleteApp(appId) {
          await deleteAppInUi(page, appId);
        },
      });
      await removeApps(created);
      files.remove();
      await context.close();
    },
    { timeout: 30_000 },
  ],
});

// Walks the catalogue pages until it finds the app's row. Null if no page has it.
export async function catalogueRow(page: Page, appId: string): Promise<Locator | null> {
  for (let n = 1; ; n++) {
    await page.goto(n === 1 ? "/catalogue" : `/catalogue?page=${n}`);
    const row = page.getByTestId(`catalogue-app-${appId}`);
    if ((await row.count()) === 1) {
      return row;
    }
    if ((await page.getByTestId("catalogue-next").count()) === 0) {
      return null;
    }
  }
}

export { expect };
