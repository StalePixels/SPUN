import type { Page } from "@playwright/test";

// Slugs are at most 16 characters, and unique for each run.
export function uniqueSlug(): string {
  return `e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 16);
}

// Every app id that a catalogue page lists, over all its pages.
export async function listedAppIds(page: Page, base: string): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; ; n++) {
    const response = await page.goto(n === 1 ? base : `${base}${base.includes("?") ? "&" : "?"}page=${n}`);
    if (response?.status() !== 200) {
      throw new Error(`${base} page ${n} gave ${response?.status()}`);
    }
    const testIds = await page
      .getByTestId(/^catalogue-app-/)
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid") ?? ""));
    ids.push(...testIds.map((testId) => testId.replace("catalogue-app-", "")));
    if ((await page.getByTestId("catalogue-next").count()) === 0) {
      return ids;
    }
  }
}
