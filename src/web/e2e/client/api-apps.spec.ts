import type { Page } from "@playwright/test";
import { makeApiKey, signedJson, type ApiKey } from "../support/api";
import {
  appCategoryIds,
  appRow,
  insertApp,
  insertRelease,
  insertUser,
  isSaved,
  liveAppIdsOf,
  removeApps,
  removeTestUser,
  setUserAppLimit,
  userByUsername,
} from "../support/db";
import { expect, test, uniqueTitle } from "../support/pages";
import { accounts } from "../support/settings";

type Category = { id: number; name: string };

async function categoryIds(page: Page, key: ApiKey): Promise<number[]> {
  const { status, body } = await signedJson(page.request, key, "GET", "/api/categories");
  expect(status).toBe(200);
  return (body.categories as Category[]).map((category) => category.id);
}

test("create, read, edit and delete an app through the API", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);
  const key = await makeApiKey(page);
  const [first, second] = await categoryIds(page, key);
  const created: string[] = [];
  try {
    const title = uniqueTitle("API");
    const made = await signedJson(page.request, key, "POST", "/api/apps", {
      title,
      description: "Made by the API",
      installDir: "apps\\myapp\\",
      categories: [first],
    });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    created.push(id);
    expect(await appRow(id)).toMatchObject({ user_id: client.id, title, install_dir: "/apps/myapp", deleted_at: null });
    expect(await appCategoryIds(id)).toEqual([first]);

    const read = await signedJson(page.request, key, "GET", `/api/apps/${id}`);
    expect(read).toEqual({
      status: 200,
      body: {
        id,
        title,
        description: "Made by the API",
        installDir: "/apps/myapp",
        categories: [first],
        releases: [],
        screenshots: [],
      },
    });

    const list = await signedJson(page.request, key, "GET", "/api/apps");
    expect((list.body.apps as { id: string }[]).map((app) => app.id)).toContain(id);

    const edited = uniqueTitle("API edited");
    const put = await signedJson(page.request, key, "PUT", `/api/apps/${id}`, {
      title: edited,
      description: "",
      categories: [second, first],
    });
    expect(put).toEqual({ status: 200, body: {} });
    expect(await appRow(id)).toMatchObject({ title: edited, install_dir: null });
    expect(await appCategoryIds(id)).toEqual([first, second].sort((a, b) => a - b));

    const refused = await signedJson(page.request, key, "PUT", `/api/apps/${id}`, {
      title: "",
      description: "",
      categories: [first],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatchObject({ code: "title.length" });
    expect((await appRow(id)).title, "a refused edit changes nothing").toBe(edited);

    const moved = await signedJson(page.request, key, "PUT", `/api/apps/${id}`, {
      title: edited,
      description: "",
      installDir: "//Games//My App/",
      categories: [first],
    });
    expect(moved).toEqual({ status: 200, body: {} });
    expect((await appRow(id)).install_dir).toBe("/Games/My App");
    const banned = await signedJson(page.request, key, "PUT", `/api/apps/${id}`, {
      title: edited,
      description: "",
      installDir: "/dot/x",
      categories: [first],
    });
    expect(banned).toEqual({ status: 400, body: { error: { code: "installDir.banned" } } });
    expect((await appRow(id)).install_dir, "a refused edit changes nothing").toBe("/Games/My App");

    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${id}`)).toEqual({ status: 200, body: {} });
    expect((await appRow(id)).deleted_at).not.toBeNull();
    const gone = await signedJson(page.request, key, "GET", `/api/apps/${id}`);
    expect(gone).toEqual({ status: 404, body: { error: { code: "app.notFound" } } });
    const again = await signedJson(page.request, key, "DELETE", `/api/apps/${id}`);
    expect(again).toEqual({ status: 404, body: { error: { code: "app.notFound" } } });
  } finally {
    await removeApps(created);
  }
});

test("the API refuses each bad title, description, install directory and category choice, and makes no app", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);
  const key = await makeApiKey(page);
  const [category] = await categoryIds(page, key);
  const before = await liveAppIdsOf(client.id);
  const good = { title: uniqueTitle("API bad"), description: "", categories: [category] };
  const cases: [Record<string, unknown>, string][] = [
    [{ ...good, title: "" }, "title.length"],
    [{ ...good, title: "x".repeat(33) }, "title.length"],
    [{ ...good, title: "Rocket 🚀" }, "title.invalidCharacters"],
    [{ ...good, description: "x".repeat(257) }, "description.length"],
    [{ ...good, description: "two\nlines" }, "description.invalidCharacters"],
    [{ ...good, installDir: "C:\\apps" }, "installDir.drive"],
    [{ ...good, installDir: "/apps/a|b" }, "installDir.invalidCharacters"],
    [{ ...good, installDir: "/apps/café" }, "installDir.invalidCharacters"],
    [{ ...good, installDir: "/apps/../sys" }, "installDir.dots"],
    [{ ...good, installDir: "/NextZXOS/apps" }, "installDir.banned"],
    [{ ...good, installDir: "/" }, "installDir.banned"],
    [{ ...good, installDir: `/${"a".repeat(64)}` }, "installDir.length"],
    [{ ...good, categories: [] }, "category.missing"],
    [{ ...good, categories: [999999] }, "category.missing"],
    [{ title: good.title, description: "" }, "category.missing"],
  ];
  for (const [body, code] of cases) {
    const response = await signedJson(page.request, key, "POST", "/api/apps", body);
    expect(response.status, code).toBe(400);
    expect(response.body.error, code).toMatchObject({ code });
  }
  expect((await liveAppIdsOf(client.id)).sort()).toEqual(before.sort());
});

test("the app limit gives app.limitReached", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);
  const key = await makeApiKey(page);
  const [category] = await categoryIds(page, key);
  const live = (await liveAppIdsOf(client.id)).length;
  try {
    await setUserAppLimit(client.id, live);
    const response = await signedJson(page.request, key, "POST", "/api/apps", {
      title: uniqueTitle("API limit"),
      description: "",
      categories: [category],
    });
    expect(response).toEqual({ status: 400, body: { error: { code: "app.limitReached", limit: live } } });
    expect(await liveAppIdsOf(client.id)).toHaveLength(live);
  } finally {
    await setUserAppLimit(client.id, client.app_limit);
  }
});

test("another user's app is app.notFound to read, edit and delete", async ({ page }) => {
  const key = await makeApiKey(page);
  const [category] = await categoryIds(page, key);
  const other = await insertUser(`e2eapi${Date.now().toString(36)}`.slice(0, 16));
  try {
    const app = await insertApp(other, "E2E other user's app");
    const notFound = { status: 404, body: { error: { code: "app.notFound" } } };
    const fields = { title: "Taken over", description: "", categories: [category] };
    expect(await signedJson(page.request, key, "GET", `/api/apps/${app}`)).toEqual(notFound);
    expect(await signedJson(page.request, key, "PUT", `/api/apps/${app}`, fields)).toEqual(notFound);
    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${app}`)).toEqual(notFound);
    expect(await appRow(app)).toMatchObject({ title: "E2E other user's app", deleted_at: null });
    expect(await signedJson(page.request, key, "GET", "/api/apps/not-an-id")).toEqual(notFound);
  } finally {
    await removeTestUser(other);
  }
});

test("save, list and unsave an app through the API; an app that is not public cannot be saved", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);
  const key = await makeApiKey(page);
  const other = await insertUser(`e2esav${Date.now().toString(36)}`.slice(0, 16));
  try {
    const shown = await insertApp(other, "E2E saved by the API");
    await insertRelease(shown, 1, "1.0");
    const hidden = await insertApp(other, "E2E not public");

    expect(await signedJson(page.request, key, "PUT", `/api/saved/${shown}`)).toEqual({ status: 200, body: {} });
    expect(await isSaved(client.id, shown)).toBe(true);
    const list = await signedJson(page.request, key, "GET", "/api/saved");
    expect(list.status).toBe(200);
    expect(list.body.saved).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: shown, title: "E2E saved by the API", version: "1.0" })]),
    );

    expect(await signedJson(page.request, key, "DELETE", `/api/saved/${shown}`)).toEqual({ status: 200, body: {} });
    expect(await isSaved(client.id, shown)).toBe(false);
    const after = await signedJson(page.request, key, "GET", "/api/saved");
    expect((after.body.saved as { id: string }[]).map((app) => app.id)).not.toContain(shown);

    const refused = await signedJson(page.request, key, "PUT", `/api/saved/${hidden}`);
    expect(refused).toEqual({ status: 404, body: { error: { code: "app.notFound" } } });
    expect(await isSaved(client.id, hidden)).toBe(false);
  } finally {
    await removeTestUser(other);
  }
});
