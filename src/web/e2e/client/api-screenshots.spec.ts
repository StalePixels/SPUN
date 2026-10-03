import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { thumbSize } from "../../src/lib/thumbs";
import { makeApiKey, signedFetch, signedJson, type ApiKey } from "../support/api";
import { insertApp, insertUser, removeApps, removeTestUser, screenshotRows } from "../support/db";
import { readyNxi, stripesPng } from "../support/images";
import { expect, test, uniqueTitle } from "../support/pages";
import { accounts, settings } from "../support/settings";

const client = accounts.client;
const MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024;

const nxiFile = (appId: string, slot: number) => path.join(settings.dataDir, client.username, "nxi", appId, String(slot));
const thumbFile = (appId: string, slot: number) =>
  path.join(settings.dataDir, client.username, "thumb", appId, String(slot));
const pngFile = (appId: string, slot: number) => path.join(settings.assetDir, "screenshots", appId, `${slot}.png`);
const shotFiles = (appId: string, slot: number) => [nxiFile(appId, slot), pngFile(appId, slot), thumbFile(appId, slot)];

async function createApp(page: Page, key: ApiKey): Promise<string> {
  const categories = await signedJson(page.request, key, "GET", "/api/categories");
  const [category] = categories.body.categories as { id: number }[];
  const made = await signedJson(page.request, key, "POST", "/api/apps", {
    title: uniqueTitle("API screenshot"),
    description: "",
    categories: [category.id],
  });
  expect(made.status).toBe(201);
  return made.body.id as string;
}

async function upload(page: Page, key: ApiKey, appId: string, slot: number | string, name: string, data: Buffer) {
  const response = await signedFetch(page.request, key, `/api/apps/${appId}/screenshots/${slot}`, {
    method: "PUT",
    multipart: { file: { name, mimeType: "application/octet-stream", buffer: data } },
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

const notFound = (code: string) => ({ status: 404, body: { error: { code } } });
const badRequest = (code: string) => ({ status: 400, body: { error: { code } } });

test("upload, replace and clear screenshots through the API", async ({ page }) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  try {
    expect(await upload(page, key, id, 1, "main.png", await stripesPng(512, 384))).toEqual({
      status: 200,
      body: { slot: 1, width: 256 },
    });
    expect(await upload(page, key, id, 2, "small.nxi", readyNxi(256))).toEqual({
      status: 200,
      body: { slot: 2, width: 256 },
    });
    expect(await upload(page, key, id, 3, "big.nxi", readyNxi(320))).toEqual({
      status: 200,
      body: { slot: 3, width: 320 },
    });

    for (const slot of [1, 2, 3]) {
      expect(statSync(thumbFile(id, slot)).size, `thumb ${slot}`).toBe(
        thumbSize(slot).width * thumbSize(slot).height,
      );
      expect(existsSync(pngFile(id, slot)), `png ${slot}`).toBe(true);
    }
    expect(statSync(nxiFile(id, 1)).size).toBe(49_664);
    expect(readFileSync(nxiFile(id, 2))).toEqual(readyNxi(256));
    expect(readFileSync(nxiFile(id, 3))).toEqual(readyNxi(320));
    const rows = await screenshotRows(id);
    expect(rows.map(({ slot, width }) => ({ slot, width }))).toEqual([
      { slot: 1, width: 256 },
      { slot: 2, width: 256 },
      { slot: 3, width: 320 },
    ]);
    const view = await signedJson(page.request, key, "GET", `/api/apps/${id}`);
    expect((view.body.screenshots as { slot: number; width: number }[]).map(({ slot, width }) => ({ slot, width })))
      .toEqual([
        { slot: 1, width: 256 },
        { slot: 2, width: 256 },
        { slot: 3, width: 320 },
      ]);

    // A replace that needs 320x256 changes the NXI, the thumbnail and the row.
    const thumbBefore = readFileSync(thumbFile(id, 1));
    expect(await upload(page, key, id, 1, "wide.png", await stripesPng(640, 512))).toEqual({
      status: 200,
      body: { slot: 1, width: 320 },
    });
    expect(statSync(nxiFile(id, 1)).size).toBe(82_432);
    expect(readFileSync(thumbFile(id, 1)).equals(thumbBefore)).toBe(false);
    const replaced = await screenshotRows(id);
    expect(replaced[0]).toMatchObject({ slot: 1, width: 320 });
    expect(replaced[0].updated_at.getTime()).toBeGreaterThan(rows[0].updated_at.getTime());

    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${id}/screenshots/2`)).toEqual({
      status: 200,
      body: {},
    });
    for (const file of shotFiles(id, 2)) {
      expect(existsSync(file), file).toBe(false);
    }
    expect((await screenshotRows(id)).map((row) => row.slot)).toEqual([1, 3]);

    // An empty slot, and slots outside 1 to 5, are screenshot.notFound.
    for (const slot of [2, 4, 0, 6, "x"]) {
      expect(await signedJson(page.request, key, "DELETE", `/api/apps/${id}/screenshots/${slot}`), `delete ${slot}`)
        .toEqual(notFound("screenshot.notFound"));
    }
    for (const slot of [0, 6]) {
      expect(await upload(page, key, id, slot, "main.png", await stripesPng(64, 48)), `upload ${slot}`).toEqual(
        notFound("screenshot.notFound"),
      );
    }
    expect((await screenshotRows(id)).map((row) => row.slot)).toEqual([1, 3]);
  } finally {
    await removeApps([id]);
  }
});

test("the API refuses a file that is not an image, a wrong-size NXI and a file over 16 MB", async ({ page }) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  try {
    expect(await upload(page, key, id, 1, "notes.png", Buffer.from("not an image\n"))).toEqual(
      badRequest("screenshot.notImage"),
    );
    expect(await upload(page, key, id, 2, "short.nxi", Buffer.alloc(49_152))).toEqual(
      badRequest("screenshot.badNxi"),
    );
    expect(await upload(page, key, id, 3, "huge.nxi", Buffer.alloc(MAX_SCREENSHOT_BYTES + 1))).toEqual(
      badRequest("screenshot.tooLarge"),
    );
    expect(await screenshotRows(id)).toEqual([]);
    for (const slot of [1, 2, 3]) {
      for (const file of shotFiles(id, slot)) {
        expect(existsSync(file), file).toBe(false);
      }
    }
  } finally {
    await removeApps([id]);
  }
});

test("another user's app is app.notFound for each screenshot call, and an upload to an unknown app", async ({
  page,
}) => {
  const key = await makeApiKey(page);
  const other = await insertUser(`e2eshot${Date.now().toString(36)}`.slice(0, 16));
  try {
    const app = await insertApp(other, "E2E other user's app");
    expect(await upload(page, key, app, 1, "small.nxi", readyNxi(256))).toEqual(notFound("app.notFound"));
    expect(await upload(page, key, "zzzzzz", 1, "small.nxi", readyNxi(256))).toEqual(notFound("app.notFound"));
    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${app}/screenshots/1`)).toEqual(
      notFound("app.notFound"),
    );
    expect(await screenshotRows(app)).toEqual([]);
  } finally {
    await removeTestUser(other);
  }
});
