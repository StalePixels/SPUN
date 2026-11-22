import type { Page } from "@playwright/test";
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
import { clickHydrated, expect, test } from "../support/pages";
import { accounts, settings } from "../support/settings";
import { spun, type SpunReply } from "../support/spunServer";

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

test("listed, unlisted and secret apps in the lists, the searches, the picker and by id", async ({ page, browser }) => {
  const word = `vis${Date.now().toString(36)}`;
  const otherId = await insertUser(`e2ev${Date.now().toString(36).slice(-8)}`);
  const clientId = (await userByUsername(accounts.client.username)).id;
  const slug = uniqueSlug();
  const categoryId = await insertCategory(slug, `E2E ${slug}`);
  const alias = `v${Date.now().toString(36).slice(-8)}`;
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await anonymous.newPage();
  let ownSecret = "";
  try {
    const listed = await insertApp(otherId, `E2E ${word} listed`);
    const unlisted = await insertApp(otherId, `E2E ${word} unlisted`);
    const secret = await insertApp(otherId, `E2E ${word} secret`);
    ownSecret = await insertApp(clientId, `E2E ${word} own secret`);
    for (const id of [listed, unlisted, secret, ownSecret]) {
      await insertRelease(id, 1, "1.0");
      await linkCategory(id, categoryId);
    }
    await setAppVisibility(unlisted, "unlisted");
    await setAppVisibility(secret, "secret");
    await setAppVisibility(ownSecret, "secret");
    await insertAlias(alias, secret);
    const notListed = [unlisted, secret, ownSecret];

    // Lists: listed apps only, for everyone.
    for (const viewer of [page, guest]) {
      const all = await listedAppIds(viewer, "/catalogue");
      expect(all).toContain(listed);
      for (const id of notListed) expect(all).not.toContain(id);
      expect(await listedAppIds(viewer, `/catalogue/${slug}`)).toEqual([listed]);
    }
    const splist = await splistIds();
    expect(splist).toContain(listed);
    for (const id of notListed) expect(splist).not.toContain(id);
    expect(ok(await spun(`SPCAT ${slug} 1`)).apps).toEqual([listed]);

    // Search: listed apps, and the owner's own secret apps on the web.
    expect(await listedAppIds(guest, `/catalogue?q=${word}`)).toEqual([listed]);
    expect(await listedAppIds(guest, `/catalogue/${slug}?q=${word}`)).toEqual([listed]);
    expect(sorted(await listedAppIds(page, `/catalogue?q=${word}`))).toEqual(sorted([listed, ownSecret]));
    expect(sorted(await listedAppIds(page, `/catalogue/${slug}?q=${word}`))).toEqual(sorted([listed, ownSecret]));
    expect(ok(await spun(`SPFIND 1 ${word}`)).apps).toEqual([listed]);
    expect(ok(await spun(`SPCAT ${slug} 1 ${word}`)).apps).toEqual([listed]);

    // Picker: text finds listed, unlisted and own secret apps; an exact id or alias finds any.
    await page.goto(`/publish/apps/${settings.testApp}/depends`);
    await expectPickerFinds(page, word, [listed, unlisted, ownSecret]);
    await expectPickerFinds(page, secret.toUpperCase(), [secret]);
    await expectPickerFinds(page, alias, [secret]);

    // By id: every state works.
    for (const id of [listed, ...notListed]) {
      expect((await guest.goto(`/catalogue/${id}`))?.status(), id).toBe(200);
      await expect(guest.getByTestId("public-app-title")).toContainText(word);
      ok(await spun(`SPINFO ${id} 1`));
    }
  } finally {
    await anonymous.close();
    if (ownSecret) await removeApps([ownSecret]);
    await removeTestUser(otherId);
    await removeCategories([categoryId]);
  }
});
