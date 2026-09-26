import { expect, test, type Page } from "@playwright/test";

type Mode = "light" | "dark" | "auto";

async function chooseMode(page: Page, mode: Mode) {
  await page.getByTestId("theme-toggle").click();
  await page.getByTestId(`theme-${mode}`).click();
}

async function themeCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === "NBN-theme")?.value;
}

const html = (page: Page) => page.locator("html");

for (const mode of ["light", "dark"] as const) {
  test(`${mode} mode stays after a reload`, async ({ page }) => {
    // The system setting is the opposite, so the chosen mode must come from the cookie.
    await page.emulateMedia({ colorScheme: mode === "light" ? "dark" : "light" });
    await page.goto("/");
    await chooseMode(page, mode);
    await expect(html(page)).toHaveAttribute("data-bs-theme", mode);
    expect(await themeCookie(page)).toBe(mode);

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-bs-theme", mode);
    expect(await themeCookie(page)).toBe(mode);
  });
}

test("auto mode follows the system setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await chooseMode(page, "light");
  await chooseMode(page, "auto");
  expect(await themeCookie(page)).toBe("auto");
  await expect(html(page)).toHaveAttribute("data-bs-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-bs-theme", "light");
});
