import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { removeApps } from "./db";
import { settings } from "./settings";

// Elements are found by data-testid, and tests check behaviour and state, not
// wording: the UI copy changes often.

// Titles are at most 32 characters, and unique for each run.
export function uniqueTitle(label: string): string {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return `E2E ${label} ${stamp}`.slice(0, 32);
}

// A calendar day in the form the CMS shows it, for example "26 Sep 2026".
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const month = date.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function releaseFile(username: string, appId: string, serial: number): string {
  return path.join(settings.dataDir, username, `${appId}-${serial.toString(16).padStart(4, "0")}.zip`);
}

export function binFile(appId: string, serial: number): string {
  return path.join(settings.binDir, `${appId}-${serial.toString(16).padStart(4, "0")}.zip`);
}

// A delete moves zips to the bin, so a test removes the bin files of its own
// apps at the end, and test runs leave nothing there.
export function removeBinFiles(appIds: string[]): void {
  if (!existsSync(settings.binDir)) {
    return;
  }
  for (const name of readdirSync(settings.binDir)) {
    if (appIds.some((id) => name.startsWith(`${id}-`))) {
      rmSync(path.join(settings.binDir, name), { force: true });
    }
  }
}

export function fileSize(file: string): number | null {
  return existsSync(file) ? statSync(file).size : null;
}

// The pathname of the current page, for checks like "stayed on the app page".
export function pathname(page: Page): string {
  return new URL(page.url()).pathname;
}

// With no category slugs, the app goes into the first category on the form.
export async function createApp(
  page: Page,
  title: string,
  description = "",
  categories: string[] = [],
): Promise<string> {
  await page.goto("/publish");
  await waitForHydration(page.getByTestId("app-submit"));
  await page.getByTestId("app-title").fill(title);
  await page.getByTestId("app-description").fill(description);
  if (categories.length === 0) {
    await page.getByTestId(/^app-category-/).first().check();
  }
  for (const slug of categories) {
    await page.getByTestId(`app-category-${slug}`).check();
  }
  await clickHydrated(page.getByTestId("app-submit"));
  await page.waitForURL(/\/publish\/apps\/[0-9a-z]{6}$/);
  return pathname(page).split("/").pop()!;
}

export async function deleteAppInUi(page: Page, appId: string): Promise<void> {
  await page.goto(`/publish/apps/${appId}`);
  await clickHydrated(page.getByTestId("delete-app"));
  await page.getByTestId("delete-app-confirm").click();
  await page.waitForURL((url) => url.pathname === "/publish");
}

export type ReleaseInput = { version: string; file?: string; historicDate?: string; changelog?: string };

export async function fillUpload(page: Page, release: ReleaseInput): Promise<void> {
  await waitForHydration(uploadForm(page));
  await page.getByTestId("upload-version").fill(release.version);
  if (release.historicDate !== undefined) {
    await page.getByTestId("upload-historic").check();
    await page.getByTestId("upload-date").fill(release.historicDate);
  }
  if (release.changelog !== undefined) {
    await page.getByTestId("upload-changelog").fill(release.changelog);
  }
  if (release.file !== undefined) {
    await page.getByTestId("upload-file").setInputFiles(release.file);
  }
}

export async function uploadRelease(page: Page, release: ReleaseInput): Promise<void> {
  await fillUpload(page, release);
  await clickHydrated(page.getByTestId("upload-submit"));
}

// React resets some attributes when it hydrates an element, so a test that
// changes the DOM by hand must wait until React has taken the element over.
export async function waitForHydration(locator: Locator): Promise<void> {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber$"))))
    .toBe(true);
}

// A click before hydration is lost: React has not attached its handler yet.
export async function clickHydrated(locator: Locator): Promise<void> {
  await waitForHydration(locator);
  await locator.click();
}

function uploadForm(page: Page) {
  return page.locator("form").filter({ has: page.getByTestId("upload-submit") });
}

// Turns off the browser's form checks, so the server's own checks get the input.
export async function skipBrowserChecks(page: Page): Promise<void> {
  await waitForHydration(uploadForm(page));
  await uploadForm(page).evaluate((form) => form.setAttribute("novalidate", ""));
}

// Submits the upload form even when its Upload button is disabled.
export async function forceUploadSubmit(page: Page): Promise<void> {
  await waitForHydration(uploadForm(page));
  await uploadForm(page).evaluate((form: HTMLFormElement) => form.requestSubmit());
}

// Apps a test creates. When the test ends they are removed outright, deleted or
// not, so a run leaves no app behind. The fixture has its own timeout, so the
// cleanup still runs after a test that timed out.
type Apps = { create(label: string, description?: string): Promise<string> };

export const test = base.extend<{ apps: Apps }>({
  apps: [
    async ({ page }, provide) => {
      const created: string[] = [];
      await provide({
        async create(label, description) {
          const id = await createApp(page, uniqueTitle(label), description);
          created.push(id);
          return id;
        },
      });
      await removeApps(created);
    },
    { timeout: 30_000 },
  ],
});

export { expect };
