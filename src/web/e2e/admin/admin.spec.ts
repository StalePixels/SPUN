import type { Page } from "@playwright/test";
import {
  defaultAppLimit,
  setDefaultAppLimit,
  setUserAppLimit,
  userByUsername,
} from "../support/db";
import { test as base, deleteAppInUi, expect, formatDay, todayUtc, waitForHydration } from "../support/pages";
import { accounts } from "../support/settings";

const admin = accounts.admin;
const client = accounts.client;

type StartState = { defaultLimit: string | null; clientUser: Awaited<ReturnType<typeof userByUsername>> };

// The default app limit applies to every user, and the client's own limit is
// changed here: both go back to their values from the start of the run, even
// when a test fails or times out. A worker fixture has its own timeout; an
// afterAll hook would share the timeout of the test that just failed.
const test = base.extend<object, { start: StartState }>({
  start: [
    async ({}, provide) => {
      const start = {
        defaultLimit: await defaultAppLimit(),
        clientUser: await userByUsername(client.username),
      };
      await provide(start);
      await setDefaultAppLimit(start.defaultLimit);
      await setUserAppLimit(start.clientUser.id, start.clientUser.app_limit);
    },
    { scope: "worker", auto: true, timeout: 30_000 },
  ],
});

async function saveDefaultLimit(page: Page, value: string) {
  await page.goto("/admin/settings");
  await page.getByTestId("setting-default-app-limit").fill(value);
  await page.getByTestId("settings-submit").click();
  await expect(page.getByTestId("form-saved")).toBeVisible();
}

test("the Admin link leads to Settings, Users and Apps", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-admin").click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const section of ["settings", "users", "apps"]) {
    await page.getByTestId(`admin-link-${section}`).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${section}$`));
    await page.goto("/admin");
  }
});

test("settings: the server refuses invalid limits, and 1 saves", async ({ page, start }) => {
  await page.goto("/admin/settings");
  const field = page.getByTestId("setting-default-app-limit");
  // A number field drops text before it is sent, so make it a text field.
  // Set the value without an input event: React puts the type back on input.
  await waitForHydration(field);
  for (const value of ["abc", "-1", "1.5"]) {
    await field.evaluate((input: HTMLInputElement, text) => {
      input.type = "text";
      input.value = text;
    }, value);
    await expect(field).toHaveValue(value);
    // The alert from the last value is still there, so wait for the server's answer.
    const answer = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/admin/settings"));
    await page.getByTestId("settings-submit").click();
    expect((await answer).ok()).toBe(true);
    await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "limit.notNumber");
    await expect(page.getByTestId("form-saved")).toHaveCount(0);
    expect(await defaultAppLimit(), value).toBe(start.defaultLimit);
  }

  await saveDefaultLimit(page, "1");
  expect(await defaultAppLimit()).toBe("1");
});

test("with a default limit of 1, the New app form comes and goes", async ({ page, apps }) => {
  const own = await userByUsername(admin.username);
  expect(own.app_limit, "the admin account needs no own limit, so the default applies").toBeNull();
  await saveDefaultLimit(page, "1");

  await page.goto("/");
  await expect(page.getByTestId("app-submit")).toBeVisible();
  const id = await apps.create("Limit");

  await page.goto("/");
  await expect(page.getByTestId("app-limit-reached")).toBeVisible();
  await expect(page.getByTestId("app-submit")).toHaveCount(0);

  await deleteAppInUi(page, id);
  await expect(page.getByTestId("app-submit")).toBeVisible();
  await expect(page.getByTestId("app-limit-reached")).toHaveCount(0);

  await page.goto("/admin/apps");
  const row = page.getByTestId(`admin-app-${id}`);
  await expect(row).toHaveClass(/text-body-secondary/);
  await expect(row.getByTestId("admin-app-deleted")).toHaveText(formatDay(todayUtc()));
});

test("users: set the client's own limit to 2, then clear it back to the default", async ({ page, start }) => {
  const { clientUser } = start;
  const row = page.getByTestId(`user-${clientUser.id}`);
  const toggle = page.getByTestId("user-own-limit-toggle");
  const number = page.getByTestId("user-app-limit");
  const save = page.getByTestId("user-submit");

  await page.goto("/admin/users");
  await row.getByTestId("user-link").click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${clientUser.id}$`));
  await expect(page.getByTestId("user-is-admin")).not.toBeChecked();

  // Ticked with no number is an error.
  await toggle.check();
  await number.fill("");
  await save.click();
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "limit.missing");

  await toggle.check();
  await number.fill("2");
  await save.click();
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await userByUsername(client.username)).toMatchObject({ app_limit: 2, is_admin: 0 });
  await page.goto("/admin/users");
  await expect(row.getByTestId("user-own-limit")).toContainText("2");
  await expect(row.getByTestId("user-limit-default")).toHaveCount(0);

  await row.getByTestId("user-link").click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(number).toBeDisabled();
  await save.click();
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await userByUsername(client.username)).toMatchObject({ app_limit: null, is_admin: 0 });
  await page.goto("/admin/users");
  await expect(row.getByTestId("user-limit-default")).toBeVisible();
});
