import { expect, test, type Page } from "@playwright/test";
import { clickHydrated } from "../support/pages";

type Mode = "light" | "dark" | "auto";

async function chooseMode(page: Page, mode: Mode) {
  await clickHydrated(page.getByTestId("theme-toggle"));
  await page.getByTestId(`theme-nbn-${mode}`).click();
}

async function cookie(page: Page, name: string) {
  return (await page.context().cookies()).find((c) => c.name === name)?.value;
}

const html = (page: Page) => page.locator("html");

async function expectStylesheet(page: Page, theme: string) {
  await expect(page.locator('link[rel="stylesheet"][href^="/themes/"]')).toHaveCount(1);
  await expect(page.locator("link#theme-css")).toHaveAttribute("href", `/themes/${theme}/theme.css`);
}

for (const mode of ["light", "dark"] as const) {
  test(`${mode} mode stays after a reload`, async ({ page }) => {
    // The system setting is the opposite, so the chosen mode must come from the cookie.
    await page.emulateMedia({ colorScheme: mode === "light" ? "dark" : "light" });
    await page.goto("/");
    await chooseMode(page, mode);
    await expect(html(page)).toHaveAttribute("data-theme", "nbn");
    await expect(html(page)).toHaveAttribute("data-bs-theme", mode);
    expect(await cookie(page, "NBN-theme")).toBe(mode);

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-bs-theme", mode);
    expect(await cookie(page, "NBN-theme")).toBe(mode);
    await expectStylesheet(page, "nbn");
  });
}

test("auto mode follows the system setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await chooseMode(page, "light");
  await chooseMode(page, "auto");
  expect(await cookie(page, "NBN-theme")).toBe("auto");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-bs-theme", "light");
});

test("SPUN is the default theme", async ({ page }) => {
  await page.context().clearCookies({ name: "SPUN-theme" });
  await page.goto("/");
  await expect(html(page)).toHaveAttribute("data-theme", "spun");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "dark");
  await expectStylesheet(page, "spun");
});

test("the SPUN theme stays after a reload and keeps the NextBestNetwork mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await chooseMode(page, "light");
  await expectStylesheet(page, "nbn");
  await clickHydrated(page.getByTestId("theme-toggle"));
  await page.getByTestId("theme-spun").click();
  await expect(html(page)).toHaveAttribute("data-theme", "spun");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "dark");
  expect(await cookie(page, "SPUN-theme")).toBe("spun");
  expect(await cookie(page, "NBN-theme")).toBe("light");
  await expectStylesheet(page, "spun");

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "spun");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "dark");
  await expectStylesheet(page, "spun");

  await chooseMode(page, "light");
  await expect(html(page)).toHaveAttribute("data-theme", "nbn");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "light");
});
