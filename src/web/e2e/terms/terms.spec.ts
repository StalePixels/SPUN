import type { Browser, Page } from "@playwright/test";
import { makeApiKey, signedJson } from "../support/api";
import {
  acceptedTermsOf,
  currentTermsId,
  insertLiveTerms,
  insertSession,
  insertUser,
  removeTestUser,
  restoreTerms,
  setTermsPublishAt,
  termsRows,
  termsSnapshot,
  userByUsername,
  userRow,
} from "../support/db";
import { test as base, clickHydrated, expect, pathname, waitForHydration } from "../support/pages";
import { accounts, settings, type Account } from "../support/settings";

// Every test starts with the seed's T&C version live and accepted by the setup
// users. A test that needs a newer version publishes one; afterwards, also after
// a failure, the versions it made go and every user's acceptance is put back,
// so other specs meet the seed state. seedTerms is the id of the seed version.
// The admin and the client each get a page of their own saved login.

const test = base.extend<{ seedTerms: number; adminPage: Page; clientPage: Page }>({
  seedTerms: [
    async ({}, provide) => {
      const snapshot = await termsSnapshot();
      const id = await currentTermsId();
      if (id === null) throw new Error("No live T&C version: run make e2e-reset.");
      try {
        await provide(id);
      } finally {
        await restoreTerms(snapshot);
      }
    },
    { auto: true, timeout: 30_000 },
  ],
  adminPage: async ({ browser }, provide) => {
    await provideLoggedIn(browser, accounts.admin, provide);
  },
  clientPage: async ({ browser }, provide) => {
    await provideLoggedIn(browser, accounts.client, provide);
  },
});

async function provideLoggedIn(browser: Browser, account: Account, provide: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ storageState: account.storageState });
  try {
    await provide(await context.newPage());
  } finally {
    await context.close();
  }
}

const DAY = 24 * 60 * 60 * 1000;

// The value of a datetime-local field: the browser runs in this machine's time zone.
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function newestTermsId(): Promise<number> {
  const [row] = await termsRows();
  return row.id;
}

async function writeVersion(
  page: Page,
  button: "terms-draft" | "terms-publish",
  options: { text?: string; time?: string; landing?: string } = {},
): Promise<number> {
  await page.goto("/admin/terms/new");
  await waitForHydration(page.getByTestId("terms-text-field"));
  await expect(page.getByTestId("terms-publish-at")).toBeEnabled();
  await page.getByTestId("terms-text-field").fill(options.text ?? `# Terms\n\nWritten at ${Date.now()}.`);
  if (options.time !== undefined) {
    await page.getByTestId("terms-publish-at").fill(options.time);
  }
  await clickHydrated(page.getByTestId(button));
  await expect(page).toHaveURL((url) => url.pathname === (options.landing ?? "/admin/terms"));
  return newestTermsId();
}

async function stateOf(page: Page, id: number): Promise<string | null> {
  await page.goto("/admin/terms");
  return page.getByTestId(`terms-${id}`).getByTestId("terms-state").getAttribute("data-state");
}

async function acceptOnTermsPage(page: Page, id: number): Promise<void> {
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(id));
  await clickHydrated(page.getByTestId("terms-accept"));
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

test("an admin writes a draft, schedules it and publishes it; a live version has no edit or delete", async ({
  adminPage: page,
  seedTerms: seed,
}) => {
  const admin = await userByUsername(accounts.admin.username);
  await page.goto("/admin");
  await page.getByTestId("admin-link-terms").click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/terms");
  await expect(page.getByTestId("terms-current-title")).toHaveText(`Version ${seed}`);
  expect(await stateOf(page, seed)).toBe("current");

  const draft = await writeVersion(page, "terms-draft", { text: "# Terms\n\nThe **first** version." });
  const [row] = await termsRows();
  expect(row).toMatchObject({ id: draft, text: "# Terms\n\nThe **first** version.", published: 0, publish_at: null });
  expect(row.text_html).toBe("<h1>Terms</h1>\n<p>The <strong>first</strong> version.</p>\n");
  expect(await stateOf(page, draft)).toBe("draft");

  await page.goto(`/admin/terms/${draft}`);
  await waitForHydration(page.getByTestId("terms-text-field"));
  await expect(page.getByTestId("terms-publish-at")).toBeEnabled();
  await page.getByTestId("terms-publish-at").fill(localInput(new Date(Date.now() + DAY)));
  await clickHydrated(page.getByTestId("terms-publish"));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/terms");
  const [scheduled] = await termsRows();
  expect(scheduled.published).toBe(1);
  expect(scheduled.publish_at!.getTime()).toBeGreaterThan(Date.now());
  expect(await stateOf(page, draft)).toBe("scheduled");
  await expect(page.getByTestId("terms-current-title")).toHaveText(`Version ${seed}`);

  // A scheduled version can still change, be unpublished or be deleted.
  await page.goto(`/admin/terms/${draft}`);
  await expect(page.getByTestId("terms-text-field")).toBeVisible();
  await expect(page.getByTestId("terms-save")).toBeVisible();
  await expect(page.getByTestId("terms-unpublish")).toBeVisible();
  await expect(page.getByTestId("delete-terms")).toBeVisible();

  // Its time passes: the admin too must accept it before the next admin page.
  await setTermsPublishAt(draft, -1);
  await page.goto("/admin/terms");
  expect(pathname(page)).toBe("/terms");
  await acceptOnTermsPage(page, draft);
  expect(await acceptedTermsOf(admin.id)).toBe(draft);

  expect(await stateOf(page, draft)).toBe("current");
  await expect(page.getByTestId("terms-current-title")).toHaveText(`Version ${draft}`);
  expect(await stateOf(page, seed)).toBe("past");
  await page.goto(`/admin/terms/${draft}`);
  await expect(page.getByTestId("terms-locked")).toBeVisible();
  for (const id of ["terms-text-field", "terms-save", "terms-draft", "terms-publish", "terms-unpublish", "delete-terms"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }

  // Publish with no time publishes now: the admin pages send the admin to accept it at once.
  await page.goto("/admin/terms/new");
  await expect(page.getByTestId("terms-text-field")).toHaveValue("# Terms\n\nThe **first** version.");
  const second = await writeVersion(page, "terms-publish", { text: "# Terms\n\nThe second version.", landing: "/terms" });
  expect(second).toBeGreaterThan(draft);
  await acceptOnTermsPage(page, second);
  expect(await stateOf(page, second)).toBe("current");
  expect(await stateOf(page, draft)).toBe("past");
});

test("a deleted or unpublished draft leaves the list and is never current", async ({
  adminPage: page,
  seedTerms: seed,
}) => {
  const id = await writeVersion(page, "terms-publish", { time: localInput(new Date(Date.now() + DAY)) });
  await page.goto(`/admin/terms/${id}`);
  await clickHydrated(page.getByTestId("terms-unpublish"));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/terms");
  expect(await stateOf(page, id)).toBe("draft");

  await page.goto(`/admin/terms/${id}`);
  await clickHydrated(page.getByTestId("delete-terms"));
  await page.getByTestId("delete-terms-confirm").click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/terms");
  await expect(page.getByTestId(`terms-${id}`)).toHaveCount(0);
  const [row] = await termsRows();
  expect(row.deleted_at).not.toBeNull();
  await page.goto("/terms");
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(seed));
});

test("a new user must accept the current version with the username", async ({ page, seedTerms: seed }) => {
  const userId = await insertUser(null);
  try {
    const token = await insertSession(userId);
    const secure = new URL(settings.baseUrl).protocol === "https:";
    await page.context().addCookies([
      { name: secure ? "__Secure-authjs.session-token" : "authjs.session-token", value: token, url: settings.baseUrl },
    ]);

    await page.goto("/username");
    await expect(page.getByTestId("username-terms")).toHaveAttribute("data-terms-id", String(seed));
    await expect(page.getByTestId("username-accept-terms")).toBeVisible();

    const username = `E2E-${Date.now().toString(36)}`.slice(0, 16);
    const form = page.locator("form").filter({ has: page.getByTestId("username-submit") });
    await waitForHydration(form);
    await form.evaluate((element) => element.setAttribute("novalidate", ""));
    await page.getByTestId("username-field").fill(username);
    await clickHydrated(page.getByTestId("username-submit"));
    await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "terms.notAccepted");
    expect((await userRow(userId)).username).toBeNull();

    // React resets the form after each submit.
    await page.getByTestId("username-field").fill(username);
    await page.getByTestId("username-accept-terms").check();
    await clickHydrated(page.getByTestId("username-submit"));
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect((await userRow(userId)).username).toBe(username);
    expect(await acceptedTermsOf(userId)).toBe(seed);
  } finally {
    await removeTestUser(userId);
  }
});

test("a newly published version sends an existing user to /terms from every page until the user accepts it", async ({
  clientPage: page,
  seedTerms: seed,
}) => {
  const client = await userByUsername(accounts.client.username);
  expect(await acceptedTermsOf(client.id)).toBe(seed);
  await page.goto("/publish");
  expect(pathname(page)).toBe("/publish");

  const first = await insertLiveTerms("Version one.", "<p>Version one.</p>\n");
  for (const path of ["/", "/catalogue", `/catalogue/${settings.testApp}`, "/publish", "/me", "/me/keys"]) {
    await page.goto(path);
    expect(pathname(page), path).toBe("/terms");
  }
  await expect(page.getByTestId("terms-must-accept")).toBeVisible();

  // A newer version goes live while the user reads the first one.
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(first));
  const second = await insertLiveTerms("Version two.", "<p>Version two.</p>\n");
  await clickHydrated(page.getByTestId("terms-accept"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "terms.notCurrent");
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(second));
  expect(await acceptedTermsOf(client.id)).toBe(seed);

  await acceptOnTermsPage(page, second);
  expect(await acceptedTermsOf(client.id)).toBe(second);
  await page.goto("/publish");
  expect(pathname(page)).toBe("/publish");
  await page.goto("/terms");
  await expect(page.getByTestId("terms")).toBeVisible();
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
});

test("/terms shows the current version to an anonymous visitor, with no accept button", async ({
  page,
  seedTerms: seed,
}) => {
  await page.goto("/terms");
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(seed));
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
  const id = await insertLiveTerms("Public terms.", "<p>Public terms.</p>\n");
  await page.goto("/terms");
  await expect(page.getByTestId("terms")).toHaveAttribute("data-terms-id", String(id));
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
  await page.goto("/catalogue");
  expect(pathname(page)).toBe("/catalogue");
});

test("the API refuses the key's user until the user accepts the current version on the web", async ({
  clientPage: page,
}) => {
  const key = await makeApiKey(page);
  expect((await signedJson(page.request, key, "GET", "/api/apps")).status).toBe(200);

  const id = await insertLiveTerms("API terms.", "<p>API terms.</p>\n");
  const refused = await signedJson(page.request, key, "GET", "/api/apps");
  expect(refused.status).toBe(403);
  expect(refused.body).toEqual({ error: { code: "api.termsNotAccepted" } });
  expect((await signedJson(page.request, key, "GET", "/api/categories")).status).toBe(403);

  await page.goto("/terms");
  await acceptOnTermsPage(page, id);
  expect((await signedJson(page.request, key, "GET", "/api/apps")).status).toBe(200);
});
