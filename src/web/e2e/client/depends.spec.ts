import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { makeApiKey, signedFetch, signedJson, type ApiKey } from "../support/api";
import {
  insertApp,
  insertRelease,
  insertUser,
  markAppDeleted,
  releaseDepends,
  releaseRow,
  removeApps,
  removeTestUser,
} from "../support/db";
import { clickHydrated, expect, releaseFile, test, todayUtc, uniqueTitle, uploadRelease } from "../support/pages";
import { accounts } from "../support/settings";
import { spun } from "../support/spunServer";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

async function createApp(page: Page, key: ApiKey): Promise<string> {
  const categories = await signedJson(page.request, key, "GET", "/api/categories");
  const [category] = categories.body.categories as { id: number }[];
  const made = await signedJson(page.request, key, "POST", "/api/apps", {
    title: uniqueTitle("Depends"),
    description: "",
    categories: [category.id],
  });
  expect(made.status).toBe(201);
  return made.body.id as string;
}

async function upload(page: Page, key: ApiKey, appId: string, version: string, zip: Buffer) {
  const response = await signedFetch(page.request, key, `/api/apps/${appId}/releases`, {
    method: "POST",
    multipart: { version, file: { name: "group.zip", mimeType: "application/zip", buffer: zip } },
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

// Apps of another publisher to depend on. Only their rows matter here, not their releases.
async function otherApps(count: number): Promise<{ userId: string; ids: string[] }> {
  const userId = await insertUser(`e2ed${Date.now().toString(36).slice(-8)}`);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await insertApp(userId, uniqueTitle(`Needed ${i}`)));
  }
  return { userId, ids: ids.sort() };
}

test("set dependencies, publish them with a release, and republish through the API", async ({ page }) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  const other = await otherApps(3);
  const [b, c, gone] = other.ids;
  await markAppDeleted(gone);
  const put = (body: unknown) => signedJson(page.request, key, "PUT", `/api/apps/${id}/depends`, body);
  const republish = (body: unknown) => signedJson(page.request, key, "POST", `/api/apps/${id}/republish`, body);
  try {
    expect(await republish({ version: "0.1" })).toEqual({ status: 404, body: { error: { code: "release.notFound" } } });

    expect(await put({ depends: [c, b.toUpperCase(), c] })).toEqual({ status: 200, body: {} });
    expect((await signedJson(page.request, key, "GET", `/api/apps/${id}`)).body.depends).toEqual([b, c]);

    expect(await put({ depends: [b, id] })).toEqual({ status: 400, body: { error: { code: "depends.self" } } });
    expect(await put({ depends: [b, gone, "zz", "nope00"] })).toEqual({
      status: 400,
      body: { error: { code: "depends.unknown", names: [gone, "zz", "nope00"] } },
    });
    expect((await signedJson(page.request, key, "GET", `/api/apps/${id}`)).body.depends).toEqual([b, c]);

    const zip = makeZip(sampleEntries());
    expect(await upload(page, key, id, "1.0", zip)).toEqual({ status: 201, body: { serial: 1, dotMoves: [] } });
    expect(await releaseDepends(id, 1)).toEqual({ depends: `${b} ${c}`, depends_count: 2 });
    expect((await signedJson(page.request, key, "GET", `/api/apps/${id}/releases/1`)).body.depends).toEqual([b, c]);

    const info = await spun(`SPINFO ${id} 1`);
    expect(info).toMatchObject({ error: null, dependsCount: 2 });
    expect(await spun(`SPDEPS ${id} 1`)).toMatchObject({ error: null, ids: [b, c] });

    // A change to the list leaves the published release as it was.
    expect(await put({})).toEqual({ status: 200, body: {} });
    expect(await releaseDepends(id, 1)).toEqual({ depends: `${b} ${c}`, depends_count: 2 });

    expect(await republish({ version: "1.0" })).toEqual({ status: 400, body: { error: { code: "version.taken" } } });
    expect(await republish({ version: "1.1", changelog: "No dependencies." })).toEqual({
      status: 201,
      body: { serial: 2, dotMoves: [] },
    });
    expect(readFileSync(releaseFile(client.username, id, 2)).equals(zip)).toBe(true);
    expect(await releaseRow(id, 2)).toMatchObject({ version: "1.1", release_date: todayUtc(), changelog: "No dependencies." });
    expect(await releaseDepends(id, 2)).toEqual({ depends: "", depends_count: 0 });

    expect(await spun(`SPINFO ${id} 1`)).toMatchObject({ error: null, dependsCount: null });
    expect(await spun(`SPDEPS ${id} 2`)).toMatchObject({ error: null, ids: [] });
    expect(await spun(`SPDEPS ${id} 1`)).toMatchObject({ error: null, ids: [b, c] });
    expect(await spun(`SPDEPS ${id} 3`)).toEqual({ error: "NoRelease_ERROR" });
    expect(await spun("SPDEPS nope00 1")).toEqual({ error: "NoApp_ERROR" });

    const notMine = await signedJson(page.request, key, "PUT", `/api/apps/${b}/depends`, { depends: [] });
    expect(notMine).toEqual({ status: 404, body: { error: { code: "app.notFound" } } });
    const republishNotMine = await signedJson(page.request, key, "POST", `/api/apps/${b}/republish`, { version: "2.0" });
    expect(republishNotMine).toEqual({ status: 404, body: { error: { code: "app.notFound" } } });
  } finally {
    await removeApps([id]);
    await removeTestUser(other.userId);
  }
});

test("the publisher sets dependencies and republishes in the app page", async ({ page, apps }) => {
  const files = tempFiles();
  const id = await apps.create("Depends GUI");
  const other = await otherApps(1);
  const [needed] = other.ids;
  await insertRelease(needed, 1, "1.0");
  try {
    await page.goto(`/publish/apps/${id}`);
    await expect(page.getByTestId("republish")).toHaveCount(0);

    await page.getByTestId("depends-input").fill("nope00");
    await clickHydrated(page.getByTestId("depends-submit"));
    await expect(page.getByTestId("depends").getByTestId("form-error")).toHaveAttribute("data-error", "depends.unknown");

    await page.getByTestId("depends-input").fill(needed.toUpperCase());
    await clickHydrated(page.getByTestId("depends-submit"));
    await expect(page.getByTestId("depends").getByTestId("form-saved")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("depends-input")).toHaveValue(needed);

    await uploadRelease(page, { version: "1.0", file: files.write("one.zip", makeZip(sampleEntries())) });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
    await expect(page.getByTestId("release-depends")).toHaveText(needed);

    await page.goto(`/publish/apps/${id}`);
    await page.getByTestId("depends-input").fill("");
    await clickHydrated(page.getByTestId("depends-submit"));
    await expect(page.getByTestId("depends").getByTestId("form-saved")).toBeVisible();

    await page.getByTestId("republish-version").fill("1.0");
    await clickHydrated(page.getByTestId("republish-submit"));
    await expect(page.getByTestId("republish").getByTestId("form-error")).toHaveAttribute("data-error", "version.taken");

    await page.getByTestId("republish-version").fill("1.0.1");
    await page.getByTestId("republish-changelog").fill("Republished.");
    await clickHydrated(page.getByTestId("republish-submit"));
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/2$`));
    await expect(page.getByTestId("release-version")).toHaveText("1.0.1");
    await expect(page.getByTestId("release-depends")).toHaveText("None");
    expect(readFileSync(releaseFile(client.username, id, 2)).equals(readFileSync(releaseFile(client.username, id, 1)))).toBe(
      true,
    );
  } finally {
    files.remove();
    await removeTestUser(other.userId);
  }
});
