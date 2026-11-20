import { expect, test } from "@playwright/test";
import { listedAppIds, uniqueSlug } from "../support/categories";
import {
  insertApp,
  insertCategory,
  insertRelease,
  insertUser,
  linkCategory,
  removeCategories,
  removeTestUser,
  setAppHidden,
} from "../support/db";
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

test("a hidden app is left out of the catalogue lists, but search, its page and SPINFO find it", async ({ page }) => {
  const word = `hid${Date.now().toString(36)}`;
  const userId = await insertUser(`e2eh${Date.now().toString(36).slice(-8)}`);
  const slug = uniqueSlug();
  const categoryId = await insertCategory(slug, `E2E ${slug}`);
  try {
    const shown = await insertApp(userId, `E2E ${word} shown`);
    const hidden = await insertApp(userId, `E2E ${word} hidden`);
    for (const id of [shown, hidden]) {
      await insertRelease(id, 1, "1.0");
      await linkCategory(id, categoryId);
    }
    await setAppHidden(hidden, true);

    const all = await listedAppIds(page, "/catalogue");
    expect(all).toContain(shown);
    expect(all).not.toContain(hidden);
    expect(await listedAppIds(page, `/catalogue/${slug}`)).toEqual([shown]);
    expect((await listedAppIds(page, `/catalogue?q=${word}`)).sort()).toEqual([shown, hidden].sort());
    expect((await listedAppIds(page, `/catalogue/${slug}?q=${word}`)).sort()).toEqual([shown, hidden].sort());

    expect((await page.goto(`/catalogue/${hidden}`))?.status()).toBe(200);
    await expect(page.getByTestId("public-app-title")).toContainText("hidden");

    const listed = await splistIds();
    expect(listed).toContain(shown);
    expect(listed).not.toContain(hidden);
    expect(ok(await spun(`SPCAT ${slug} 1`)).apps).toEqual([shown]);
    expect(ok(await spun(`SPFIND 1 ${word}`)).apps.sort()).toEqual([shown, hidden].sort());
    ok(await spun(`SPINFO ${hidden} 1`));
  } finally {
    await removeTestUser(userId);
    await removeCategories([categoryId]);
  }
});
