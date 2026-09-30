import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { screenshotRows } from "../support/db";
import { clickHydrated, deleteAppInUi, expect, test, uploadRelease, waitForHydration } from "../support/pages";
import { accounts, settings } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

let files: ReturnType<typeof tempFiles>;
test.beforeEach(() => {
  files = tempFiles();
});
test.afterEach(() => {
  files.remove();
});

const nxiFile = (appId: string, slot: number) => path.join(settings.dataDir, client.username, "nxi", appId, String(slot));
const pngFile = (appId: string, slot: number) => path.join(settings.assetDir, "screenshots", appId, `${slot}.png`);
const binFiles = (appId: string) =>
  existsSync(settings.binDir) ? readdirSync(settings.binDir).filter((name) => name.startsWith(`${appId}-`)) : [];

// A PNG of coloured stripes, so a replace gives different bytes.
async function stripes(width: number, height: number, name: string): Promise<string> {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    rgb[i * 3] = (x * 32) & 0xff;
    rgb[i * 3 + 1] = (Math.floor(i / width) * 16) & 0xff;
    rgb[i * 3 + 2] = 0xe0;
  }
  const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return files.write(name, png);
}

// A ready 320x256 NXI: a 512-byte palette, then one byte for each pixel.
function readyNxi(name: string): string {
  const data = Buffer.alloc(512 + 320 * 256);
  data[2] = 0xe0;
  for (let at = 512; at < data.length; at++) {
    data[at] = at % 2;
  }
  return files.write(name, data);
}

async function uploadScreenshot(page: Page, slot: number, file: string) {
  await waitForHydration(page.getByTestId(`screenshot-upload-${slot}`));
  await page.getByTestId(`screenshot-file-${slot}`).setInputFiles(file);
  await clickHydrated(page.getByTestId(`screenshot-upload-${slot}`));
}

// The image loaded, at the Next's pixel size.
async function naturalWidth(page: Page, testId: string): Promise<number> {
  const image = page.getByTestId(testId);
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete)).toBe(true);
  return image.evaluate((element: HTMLImageElement) => element.naturalWidth);
}

test("upload, replace and clear screenshots, and the public page shows them", async ({ page, apps }) => {
  const id = await apps.create("Screenshots");
  await page.goto(`/publish/apps/${id}`);
  await uploadRelease(page, { version: "1.0", file: files.write("1.0.zip", makeZip(sampleEntries())) });
  await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));

  await page.goto(`/publish/apps/${id}`);
  await uploadScreenshot(page, 1, await stripes(512, 384, "main.png"));
  await expect(page.getByTestId("screenshot-preview-1")).toBeVisible();
  await uploadScreenshot(page, 2, readyNxi("ready.nxi"));
  await expect(page.getByTestId("screenshot-preview-2")).toBeVisible();

  expect(statSync(nxiFile(id, 1)).size).toBe(49_664);
  expect(readFileSync(nxiFile(id, 2))).toEqual(readFileSync(readyNxi("again.nxi")));
  expect(existsSync(pngFile(id, 1))).toBe(true);
  expect(existsSync(pngFile(id, 2))).toBe(true);
  const rows = await screenshotRows(id);
  expect(rows.map(({ slot, width }) => ({ slot, width }))).toEqual([
    { slot: 1, width: 256 },
    { slot: 2, width: 320 },
  ]);

  await page.goto(`/apps/${id}`);
  expect(await naturalWidth(page, "public-screenshot-1")).toBe(256);
  expect(await naturalWidth(page, "public-screenshot-2")).toBe(320);
  const src = await page.getByTestId("public-screenshot-1").getAttribute("src");
  const response = await page.request.get(src!);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toContain("immutable");

  // Replace the main screenshot at once, with one that needs 320x256: a stale
  // cached PNG on the public page would still be 256 wide.
  const before = readFileSync(nxiFile(id, 1));
  await page.goto(`/publish/apps/${id}`);
  await uploadScreenshot(page, 1, await stripes(640, 512, "wide.png"));
  await expect(page.getByTestId("screenshot-preview-1")).toHaveAttribute("width", "320");
  expect(statSync(nxiFile(id, 1)).size).toBe(82_432);
  expect(readFileSync(nxiFile(id, 1)).equals(before)).toBe(false);
  const replaced = await screenshotRows(id);
  expect(replaced[0]).toMatchObject({ slot: 1, width: 320 });
  expect(replaced[0].updated_at.getTime()).toBeGreaterThan(rows[0].updated_at.getTime());
  expect(binFiles(id)).toEqual([]);

  await clickHydrated(page.getByTestId("screenshot-clear-2"));
  await expect(page.getByTestId("screenshot-empty-2")).toBeVisible();
  expect(existsSync(nxiFile(id, 2))).toBe(false);
  expect(existsSync(pngFile(id, 2))).toBe(false);
  expect((await screenshotRows(id)).map((row) => row.slot)).toEqual([1]);
  expect(binFiles(id)).toEqual([]);

  await page.goto(`/apps/${id}`);
  expect(await naturalWidth(page, "public-screenshot-1")).toBe(320);
  await expect(page.getByTestId("public-screenshot-2")).toHaveCount(0);
});

test("a text file shows screenshot.notImage, and a wrong-size NXI screenshot.badNxi", async ({ page, apps }) => {
  const id = await apps.create("BadShot");
  await page.goto(`/publish/apps/${id}`);
  await uploadScreenshot(page, 3, files.write("notes.png", Buffer.from("not an image\n")));
  await expect(page.getByTestId("screenshot-slot-3").getByTestId("form-error")).toHaveAttribute(
    "data-error",
    "screenshot.notImage",
  );
  await uploadScreenshot(page, 4, files.write("short.nxi", Buffer.alloc(49_152)));
  await expect(page.getByTestId("screenshot-slot-4").getByTestId("form-error")).toHaveAttribute(
    "data-error",
    "screenshot.badNxi",
  );
  expect(await screenshotRows(id)).toEqual([]);
});

test("an app delete moves its screenshots to the bin", async ({ page, apps }) => {
  const id = await apps.create("ShotDelete");
  await page.goto(`/publish/apps/${id}`);
  await uploadScreenshot(page, 1, await stripes(256, 192, "main.png"));
  await expect(page.getByTestId("screenshot-preview-1")).toBeVisible();

  await deleteAppInUi(page, id);
  expect(existsSync(nxiFile(id, 1))).toBe(false);
  expect(existsSync(pngFile(id, 1))).toBe(false);
  expect(binFiles(id).sort()).toEqual([`${id}-nxi-1`, `${id}-png-1`]);
  expect((await screenshotRows(id)).map((row) => row.slot)).toEqual([1]);
});
