import type { Page } from "@playwright/test";
import {
  allFeatureRows,
  appRow,
  featureRow,
  featureRows,
  firstLiveCategoryId,
  insertApp,
  insertFeature,
  insertRelease,
  insertUser,
  linkCategory,
  markAppDeleted,
  publishedFeatureIds,
  removeTestUser,
  restoreFeature,
  setFeaturePublishAt,
  setReleaseDeleted,
  type FeatureRow,
} from "../support/db";
import { test as base, clickHydrated, expect, uniqueTitle, waitForHydration } from "../support/pages";
import { settings } from "../support/settings";

// Features for apps of a user the test inserts. Their releases are rows only,
// enough for the public rule. At the end the user goes with its apps and their
// features, and the setup's feature of the test app is put back as it was, so
// it is again the only live feature and the hero.

type Owner = {
  // An app with one live release, or none when release is false.
  app(label: string, options?: { release?: boolean; description?: string }): Promise<string>;
};

const test = base.extend<{ owner: Owner; setupFeature: FeatureRow }>({
  setupFeature: [
    async ({}, provide) => {
      const [first] = await featureRows(settings.testApp);
      const row = await featureRow(first.id);
      if (!row) throw new Error("The setup's feature of the test app is missing.");
      await provide(row);
      await restoreFeature(row);
    },
    { auto: true, timeout: 30_000 },
  ],
  owner: [
    async ({}, provide) => {
      const userId = await insertUser(`E2E-${Date.now().toString(36)}`.slice(0, 16));
      await provide({
        async app(label, options = {}) {
          const id = await insertApp(userId, uniqueTitle(label), options.description ?? "");
          await linkCategory(id, await firstLiveCategoryId());
          if (options.release !== false) {
            await insertRelease(id, 1, "1.0");
          }
          return id;
        },
      });
      await removeTestUser(userId);
    },
    { timeout: 30_000 },
  ],
});

// The value of a datetime-local field: the browser runs in this machine's time zone.
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DAY = 24 * 60 * 60 * 1000;

async function openEditor(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page.getByTestId("feature-article"));
  await expect(page.getByTestId("feature-publish-at")).toBeEnabled();
}

async function writeFeature(
  page: Page,
  appId: string,
  button: "feature-draft" | "feature-publish",
  options: { article?: string; time?: string } = {},
): Promise<number> {
  await openEditor(page, `/admin/featured/new?app=${appId}`);
  await page.getByTestId("feature-article").fill(options.article ?? `An article about ${appId}.`);
  if (options.time !== undefined) {
    await page.getByTestId("feature-publish-at").fill(options.time);
  }
  await clickHydrated(page.getByTestId(button));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured");
  const [row] = await allFeatureRows(appId);
  return row.id;
}

async function heroTitle(page: Page): Promise<string> {
  await page.goto("/");
  return page.getByTestId("hero").getByTestId("hero-title").innerText();
}

async function timelineIds(page: Page): Promise<string[]> {
  await page.goto("/admin/featured");
  const rows = page.getByTestId("featured-timeline").locator(":scope > a");
  return rows.evaluateAll((links) => links.map((link) => link.getAttribute("data-testid") ?? ""));
}

async function stateOf(page: Page, id: number): Promise<string | null> {
  await page.goto("/admin/featured");
  return page.getByTestId(`feature-${id}`).getByTestId("feature-state").getAttribute("data-state");
}

async function testAppTitle(): Promise<string> {
  return (await appRow(settings.testApp)).title;
}

test("the search finds public apps and apps with no live release, with their state, and never a deleted app", async ({
  page,
  owner,
}) => {
  const word = `word${Date.now().toString(36)}`;
  const live = await owner.app("Live", { description: `Has ${word}.` });
  const none = await owner.app("None", { release: false, description: `Has ${word}.` });
  const gone = await owner.app("Gone", { release: false, description: `Has ${word}.` });
  await insertRelease(gone, 1, "1.0");
  await setReleaseDeleted(gone, 1, true);
  const deleted = await owner.app("Deleted", { description: `Has ${word}.` });
  await markAppDeleted(deleted);

  await page.goto("/admin/featured");
  await page.getByTestId("featured-new").click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured/new");
  await page.getByTestId("featured-search-input").fill(word.toUpperCase());
  await page.getByTestId("featured-search-submit").click();
  await expect(page.getByTestId("featured-search-results")).toBeVisible();
  await expect(page.getByTestId(`featured-app-${live}`).getByTestId("app-state")).toHaveAttribute("data-state", "public");
  await expect(page.getByTestId(`featured-app-${none}`).getByTestId("app-state")).toHaveAttribute("data-state", "noRelease");
  await expect(page.getByTestId(`featured-app-${gone}`).getByTestId("app-state")).toHaveAttribute("data-state", "noRelease");
  await expect(page.getByTestId(`featured-app-${deleted}`)).toHaveCount(0);

  await page.goto(`/admin/featured/new?q=${encodeURIComponent(await testAppTitle())}`);
  const testApp = page.getByTestId(`featured-app-${settings.testApp}`);
  await expect(testApp.getByTestId("app-state")).toHaveAttribute("data-state", "public");
  await testApp.getByTestId("featured-app-feature").click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured/new" && url.searchParams.get("app") === settings.testApp);

  expect((await page.goto(`/admin/featured/new?app=${deleted}`))?.status()).toBe(404);
});

test("the editor for an app featured before starts with its last article, deleted or not", async ({ page, owner }) => {
  const old = await owner.app("Old");
  await insertFeature(old, "The first article.", { updatedSecondsAgo: 100 });
  await insertFeature(old, "The last article.", { updatedSecondsAgo: 10, deleted: true });
  await openEditor(page, `/admin/featured/new?app=${old}`);
  await expect(page.getByTestId("feature-article")).toHaveValue("The last article.");

  const fresh = await owner.app("Fresh");
  await openEditor(page, `/admin/featured/new?app=${fresh}`);
  await expect(page.getByTestId("feature-article")).toHaveValue("");
});

test("Save draft puts the feature in the drafts list, renders it, and does not change /", async ({ page, owner }) => {
  const id = await owner.app("Draft");
  const featureId = await writeFeature(page, id, "feature-draft", { article: "A **draft**\nwith two lines." });

  await expect(page.getByTestId("featured-drafts").getByTestId(`feature-${featureId}`)).toBeVisible();
  await expect(page.getByTestId("featured-timeline").getByTestId(`feature-${featureId}`)).toHaveCount(0);
  const row = await featureRow(featureId);
  expect(row).toMatchObject({ published: 0, publish_at: null, article: "A **draft**\nwith two lines." });
  expect(row?.article_html).toBe("<p>A <strong>draft</strong><br>\nwith two lines.</p>\n");
  expect(await heroTitle(page)).toBe(await testAppTitle());

  await page.goto("/admin/featured");
  await page.getByTestId(`feature-${featureId}`).click();
  await expect(page).toHaveURL((url) => url.pathname === `/admin/featured/${featureId}`);
  await expect(page.getByTestId("feature-article")).toHaveValue("A **draft**\nwith two lines.");
});

test("Publish with an empty time makes the feature the hero and the target of /catalogue/featured", async ({
  page,
  owner,
}) => {
  const id = await owner.app("Now");
  const featureId = await writeFeature(page, id, "feature-publish");

  await expect(page.getByTestId("featured-live-title")).toHaveText((await appRow(id)).title);
  expect(await stateOf(page, featureId)).toBe("live");
  expect((await featureRow(featureId))?.published).toBe(1);
  expect(await heroTitle(page)).toBe((await appRow(id)).title);
  await page.goto("/catalogue/featured");
  await expect(page).toHaveURL((url) => url.pathname === `/catalogue/${id}`);
});

test("Publish with a future time is scheduled, and goes live when its time passes", async ({ page, owner }) => {
  const id = await owner.app("Later");
  const featureId = await writeFeature(page, id, "feature-publish", { time: localInput(new Date(Date.now() + DAY)) });

  expect(await stateOf(page, featureId)).toBe("scheduled");
  const ids = await timelineIds(page);
  expect(ids[0]).toBe(`feature-${featureId}`);
  expect(await heroTitle(page)).toBe(await testAppTitle());

  await setFeaturePublishAt(featureId, -5);
  expect(await heroTitle(page)).toBe((await appRow(id)).title);
  expect(await stateOf(page, featureId)).toBe("live");
});

test("the editor refuses a changed past time, a 1025-character article and a future time on the only live feature", async ({
  page,
  owner,
  setupFeature,
}) => {
  const id = await owner.app("Errors");
  await openEditor(page, `/admin/featured/new?app=${id}`);
  await page.getByTestId("feature-article").fill("An article.");
  await page.getByTestId("feature-publish-at").fill(localInput(new Date(Date.now() - DAY)));
  await clickHydrated(page.getByTestId("feature-publish"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "feature.publishPast");

  await openEditor(page, `/admin/featured/new?app=${id}`);
  const article = page.getByTestId("feature-article");
  await article.evaluate((element) => element.removeAttribute("maxlength"));
  await article.fill("a".repeat(1025));
  await clickHydrated(page.getByTestId("feature-publish"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "feature.articleLength");
  expect(await allFeatureRows(id)).toEqual([]);

  expect(await publishedFeatureIds()).toEqual([setupFeature.id]);
  await openEditor(page, `/admin/featured/${setupFeature.id}`);
  await page.getByTestId("feature-publish-at").fill(localInput(new Date(Date.now() + DAY)));
  await clickHydrated(page.getByTestId("feature-save"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "feature.lastLive");
  expect(await featureRow(setupFeature.id)).toEqual(setupFeature);
});

test("unpublishing the newest live feature makes the previous one the hero, and keeps its time", async ({
  page,
  owner,
}) => {
  const id = await owner.app("Unpublish");
  const featureId = await writeFeature(page, id, "feature-publish");
  expect(await heroTitle(page)).toBe((await appRow(id)).title);
  const before = await featureRow(featureId);

  await openEditor(page, `/admin/featured/${featureId}`);
  await clickHydrated(page.getByTestId("feature-unpublish"));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured");
  expect(await heroTitle(page)).toBe(await testAppTitle());
  expect(await featureRow(featureId)).toMatchObject({ published: 0, publish_at: before?.publish_at });
  expect(await stateOf(page, featureId)).toBe("unpublished");
});

test("unpublishing or deleting the only live feature is refused", async ({ page, setupFeature }) => {
  expect(await publishedFeatureIds()).toEqual([setupFeature.id]);
  await openEditor(page, `/admin/featured/${setupFeature.id}`);
  await clickHydrated(page.getByTestId("feature-unpublish"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "feature.lastLive");
  expect(await featureRow(setupFeature.id)).toEqual(setupFeature);

  await openEditor(page, `/admin/featured/${setupFeature.id}`);
  await clickHydrated(page.getByTestId("delete-feature"));
  await page.getByTestId("delete-feature-confirm").click();
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "feature.lastLive");
  expect(await featureRow(setupFeature.id)).toEqual(setupFeature);
  expect(await heroTitle(page)).toBe(await testAppTitle());
});

test("republishing an unpublished feature puts it back at its old place in the timeline", async ({
  page,
  owner,
  setupFeature,
}) => {
  const first = await writeFeature(page, await owner.app("First"), "feature-publish");
  const second = await writeFeature(page, await owner.app("Second"), "feature-publish");
  const order = [`feature-${second}`, `feature-${first}`, `feature-${setupFeature.id}`];
  const placed = (ids: string[]) => ids.filter((id) => order.includes(id));
  expect(placed(await timelineIds(page))).toEqual(order);
  const before = await featureRow(first);

  await openEditor(page, `/admin/featured/${first}`);
  await clickHydrated(page.getByTestId("feature-unpublish"));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured");
  expect(await stateOf(page, first)).toBe("unpublished");
  expect(placed(await timelineIds(page))).toEqual(order);

  await openEditor(page, `/admin/featured/${first}`);
  await clickHydrated(page.getByTestId("feature-publish"));
  await expect(page).toHaveURL((url) => url.pathname === "/admin/featured");
  expect(await featureRow(first)).toMatchObject({ published: 1, publish_at: before?.publish_at });
  expect(placed(await timelineIds(page))).toEqual(order);
  expect(await stateOf(page, first)).toBe("past");
  expect(await stateOf(page, second)).toBe("live");
});

test("a deleted feature leaves the drafts list and the timeline", async ({ page, owner }) => {
  const id = await owner.app("Deleted");
  const draft = await writeFeature(page, id, "feature-draft");
  const live = await writeFeature(page, id, "feature-publish");
  expect(await heroTitle(page)).toBe((await appRow(id)).title);

  for (const featureId of [draft, live]) {
    await openEditor(page, `/admin/featured/${featureId}`);
    await clickHydrated(page.getByTestId("delete-feature"));
    await page.getByTestId("delete-feature-confirm").click();
    await expect(page).toHaveURL((url) => url.pathname === "/admin/featured");
    await expect(page.getByTestId(`feature-${featureId}`)).toHaveCount(0);
    expect((await featureRow(featureId))?.deleted_at).not.toBeNull();
    expect((await page.goto(`/admin/featured/${featureId}`))?.status()).toBe(404);
  }
  expect(await heroTitle(page)).toBe(await testAppTitle());
});

test("a feature drops out while its app has no live release, and comes back with the release", async ({
  page,
  owner,
}) => {
  const id = await owner.app("Release");
  const featureId = await writeFeature(page, id, "feature-publish");
  const title = (await appRow(id)).title;
  expect(await heroTitle(page)).toBe(title);

  await setReleaseDeleted(id, 1, true);
  expect(await heroTitle(page)).toBe(await testAppTitle());
  expect(await stateOf(page, featureId)).toBe("hidden");

  await setReleaseDeleted(id, 1, false);
  expect(await heroTitle(page)).toBe(title);
  expect(await stateOf(page, featureId)).toBe("live");
});
