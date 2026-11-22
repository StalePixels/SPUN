import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Page } from "@playwright/test";
import { makeApiKey, signedJson } from "../support/api";
import { listedAppIds, uniqueSlug } from "../support/categories";
import {
  insertAlias,
  insertApp,
  insertCategory,
  insertRelease,
  insertUser,
  linkCategory,
  removeApps,
  removeCategories,
  removeTestUser,
  setAppVisibility,
  userByUsername,
} from "../support/db";
import { connectMcpClient, MCP_URL } from "../support/oauth";
import { clickHydrated, expect, test } from "../support/pages";
import { accounts, settings } from "../support/settings";
import { spun, type SpunReply } from "../support/spunServer";
import { problemMessage } from "../../src/lib/messages";

function ok(reply: SpunReply) {
  if (reply.error !== null) throw new Error(`Server said ${reply.error}`);
  return reply;
}

// Every SPLIST page, as listedAppIds does for the web catalogue.
async function splistIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; ; n++) {
    const reply = ok(await spun(`SPLIST ${n}`));
    ids.push(...reply.apps);
    if (n >= reply.pages) {
      return ids;
    }
  }
}

// The picker shows the last search's answer, so the check waits for the expected ids.
async function expectPickerFinds(page: Page, text: string, expected: string[]): Promise<void> {
  await page.getByTestId("depends-search").fill(text);
  await clickHydrated(page.getByTestId("depends-search-submit"));
  await expect
    .poll(async () => {
      const testIds = await page
        .getByTestId(/^depends-add-/)
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid") ?? ""));
      return testIds.map((testId) => testId.replace("depends-add-", "")).sort();
    }, { message: text })
    .toEqual([...expected].sort());
}

const sorted = (ids: string[]) => [...ids].sort();

async function searchTool(client: Client, args: Record<string, unknown>) {
  const result = await client.callTool({ name: "search_depends", arguments: args });
  const [content] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, body: JSON.parse(content.text) as Record<string, unknown> };
}

test("listed, unlisted and secret apps in the lists, the searches, the picker and by id", async ({ page, browser }) => {
  const word = `vis${Date.now().toString(36)}`;
  const otherId = await insertUser(`e2ev${Date.now().toString(36).slice(-8)}`);
  const clientId = (await userByUsername(accounts.client.username)).id;
  const slug = uniqueSlug();
  const categoryId = await insertCategory(slug, `E2E ${slug}`);
  const alias = `v${Date.now().toString(36).slice(-8)}`;
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await anonymous.newPage();
  const mcp = new Client({ name: "spun-e2e", version: "1.0.0" });
  const own: string[] = [];
  try {
    const listed = await insertApp(otherId, `E2E ${word} listed`);
    const unlisted = await insertApp(otherId, `E2E ${word} unlisted`);
    const secret = await insertApp(otherId, `E2E ${word} secret`);
    const ownListed = await insertApp(clientId, `E2E ${word} own listed`);
    const ownUnlisted = await insertApp(clientId, `E2E ${word} own unlisted`);
    const ownSecret = await insertApp(clientId, `E2E ${word} own secret`);
    own.push(ownListed, ownUnlisted, ownSecret);
    for (const id of [listed, unlisted, secret, ...own]) {
      await insertRelease(id, 1, "1.0");
      await linkCategory(id, categoryId);
    }
    await setAppVisibility(unlisted, "unlisted");
    await setAppVisibility(secret, "secret");
    await setAppVisibility(ownUnlisted, "unlisted");
    await setAppVisibility(ownSecret, "secret");
    await insertAlias(alias, secret);
    const notListed = [unlisted, secret, ownUnlisted, ownSecret];

    // Lists: listed apps only, for everyone.
    for (const viewer of [page, guest]) {
      const all = await listedAppIds(viewer, "/catalogue");
      expect(all).toEqual(expect.arrayContaining([listed, ownListed]));
      for (const id of notListed) expect(all).not.toContain(id);
      expect(sorted(await listedAppIds(viewer, `/catalogue/${slug}`))).toEqual(sorted([listed, ownListed]));
    }
    const splist = await splistIds();
    expect(splist).toEqual(expect.arrayContaining([listed, ownListed]));
    for (const id of notListed) expect(splist).not.toContain(id);
    expect(sorted(ok(await spun(`SPCAT ${slug} 1`)).apps)).toEqual(sorted([listed, ownListed]));

    // Search: listed apps, and on the web all the searcher's own apps.
    const listedOnly = sorted([listed, ownListed]);
    expect(sorted(await listedAppIds(guest, `/catalogue?q=${word}`))).toEqual(listedOnly);
    expect(sorted(await listedAppIds(guest, `/catalogue/${slug}?q=${word}`))).toEqual(listedOnly);
    expect(sorted(await listedAppIds(page, `/catalogue?q=${word}`))).toEqual(sorted([listed, ...own]));
    expect(sorted(await listedAppIds(page, `/catalogue/${slug}?q=${word}`))).toEqual(sorted([listed, ...own]));
    expect(sorted(ok(await spun(`SPFIND 1 ${word}`)).apps)).toEqual(listedOnly);
    expect(sorted(ok(await spun(`SPCAT ${slug} 1 ${word}`)).apps)).toEqual(listedOnly);

    // Picker, its API call and its MCP tool: text finds listed, unlisted and all own apps;
    // an exact id or alias finds any.
    const finds: [string, string[]][] = [
      [word, [listed, unlisted, ...own]],
      [secret.toUpperCase(), [secret]],
      [alias, [secret]],
      ["", []],
    ];
    await page.goto(`/publish/apps/${settings.testApp}/depends`);
    for (const [text, expected] of finds.slice(0, 3)) {
      await expectPickerFinds(page, text, expected);
    }
    const key = await makeApiKey(page);
    const { accessToken } = await connectMcpClient(page, `E2E MCP search ${Date.now().toString(36)}`);
    await mcp.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: { token: async () => accessToken } }));
    const searchPath = (id: string, text: string) => `/api/apps/${id}/depends/search?q=${encodeURIComponent(text)}`;
    for (const [text, expected] of finds) {
      const api = await signedJson(page.request, key, "GET", searchPath(settings.testApp, text));
      expect(api.status, text).toBe(200);
      const apps = api.body.apps as { id: string; deleted: boolean }[];
      expect(sorted(apps.map((app) => app.id)), text).toEqual(sorted(expected));
      expect(apps.every((app) => !app.deleted), text).toBe(true);
      expect(await searchTool(mcp, { id: settings.testApp.toUpperCase(), q: text }), text).toEqual({ isError: false, body: api.body });
    }
    expect(await searchTool(mcp, { id: settings.testApp })).toEqual({ isError: false, body: { apps: [] } });
    const notFound = { status: 404, body: { error: { code: "app.notFound" } } };
    for (const id of [listed, "not-an-id"]) {
      expect(await signedJson(page.request, key, "GET", searchPath(id, word)), id).toEqual(notFound);
      expect(await searchTool(mcp, { id, q: word }), id).toEqual({
        isError: true,
        body: { error: notFound.body.error, message: problemMessage({ code: "app.notFound" }) },
      });
    }

    // By id: every state works.
    for (const id of [listed, ...notListed]) {
      expect((await guest.goto(`/catalogue/${id}`))?.status(), id).toBe(200);
      await expect(guest.getByTestId("public-app-title")).toContainText(word);
      ok(await spun(`SPINFO ${id} 1`));
    }
  } finally {
    await mcp.close();
    await anonymous.close();
    await removeApps(own);
    await removeTestUser(otherId);
    await removeCategories([categoryId]);
  }
});
