import { defineConfig, devices } from "@playwright/test";
import { accounts, settings } from "./e2e/support/settings";

// Browser tests against a running CMS. Settings come from .env.e2e.
// One worker: the admin tests change the default app limit, which applies to
// every user, so no other test may run at the same time.
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: settings.baseUrl,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "client",
      testMatch: /client\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: accounts.client.storageState },
    },
    // No stored login: the page is an anonymous visitor. The client login is
    // used only in a second browser context, to publish the apps under test.
    {
      name: "public",
      testMatch: /public\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: accounts.admin.storageState },
    },
  ],
});
