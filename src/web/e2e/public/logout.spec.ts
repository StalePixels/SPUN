import { randomBytes } from "node:crypto";
import { insertSession, insertUser, removeTestUser } from "../support/db";
import { clickHydrated } from "../support/pages";
import { expect, test } from "../support/publisher";
import { settings } from "../support/settings";

// The logout's redirect remounts the root layout. With no theme cookie the
// server renders light, so a dark system setting shows whether the theme held
// in every frame. A throwaway user logs out, so no stored login is lost.
test("logging out keeps the theme in every frame and logs no console error", async ({ page }) => {
  const userId = await insertUser(`Out${randomBytes(3).toString("hex")}`);
  try {
    const token = await insertSession(userId);
    const secure = new URL(settings.baseUrl).protocol === "https:";
    await page.context().addCookies([
      {
        name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
        value: token,
        url: settings.baseUrl,
      },
    ]);
    await page.emulateMedia({ colorScheme: "dark" });
    // A string, so the bundler adds no helpers that the page lacks.
    await page.addInitScript(`(function () {
      window.__themeFrames = [];
      function frame() {
        window.__themeFrames.push(document.documentElement.getAttribute("data-bs-theme"));
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })()`);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await clickHydrated(page.getByTestId("nav-logout"));
    await expect(page.getByTestId("nav-login")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

    const frames = await page.evaluate(() => (window as unknown as { __themeFrames: string[] }).__themeFrames);
    expect(frames.length).toBeGreaterThan(0);
    expect(new Set(frames)).toEqual(new Set(["dark"]));
    expect(errors).toEqual([]);
  } finally {
    await removeTestUser(userId);
  }
});
