import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { appRow } from "./db";
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

export function fileSize(file: string): number | null {
  return existsSync(file) ? statSync(file).size : null;
}

// The pathname of the current page, for checks like "stayed on the app page".
export function pathname(page: Page): string {
  return new URL(page.url()).pathname;
}

export async function createApp(page: Page, title: string, description = ""): Promise<string> {
  await page.goto("/");
  await page.getByTestId("app-title").fill(title);
  await page.getByTestId("app-description").fill(description);
  await page.getByTestId("app-submit").click();
  await page.waitForURL(/\/apps\/[0-9a-z]{6}$/);
  return pathname(page).split("/").pop()!;
}

export async function deleteAppInUi(page: Page, appId: string): Promise<void> {
  await page.goto(`/apps/${appId}`);
  await page.getByTestId("delete-app").click();
  await page.getByTestId("delete-app-confirm").click();
  await page.waitForURL((url) => url.pathname === "/");
}

export type ReleaseInput = { version: string; file?: string; historicDate?: string };

export async function fillUpload(page: Page, release: ReleaseInput): Promise<void> {
  await page.getByTestId("upload-version").fill(release.version);
  if (release.historicDate !== undefined) {
    await page.getByTestId("upload-historic").check();
    await page.getByTestId("upload-date").fill(release.historicDate);
  }
  if (release.file !== undefined) {
    await page.getByTestId("upload-file").setInputFiles(release.file);
  }
}

export async function uploadRelease(page: Page, release: ReleaseInput): Promise<void> {
  await fillUpload(page, release);
  await page.getByTestId("upload-submit").click();
}

// React resets some attributes when it hydrates an element, so a test that
// changes the DOM by hand must wait until React has taken the element over.
export async function waitForHydration(locator: Locator): Promise<void> {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber$"))))
    .toBe(true);
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

// Apps a test creates. Whatever is still live when the test ends is deleted,
// so a failed test leaves no app behind. The fixture has its own timeout, so
// the cleanup still runs after a test that timed out.
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
      for (const id of created) {
        const row = await appRow(id);
        if (row && row.deleted_at === null) {
          await deleteAppInUi(page, id);
        }
      }
    },
    { timeout: 30_000 },
  ],
});

export { expect };
