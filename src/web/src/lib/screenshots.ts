import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { screenshots } from "@/db/schema";
import type { AppId } from "./apps";
import { db } from "./db";
import { checkNxi, convertImage, previewPng, type NxiWidth } from "./nxi";
import type { Problem } from "./problems";
import { MAX_SCREENSHOT_BYTES, screenshotUrl } from "./rules";
import { binScreenshot, removeScreenshot, unbinScreenshot, writeScreenshot } from "./storage";

export type Screenshot = { slot: number; width: number; url: string };

export type ScreenshotUpload = { nxi: Buffer; png: Buffer; width: NxiWidth };

export type ScreenshotCheck = { ok: true; shot: ScreenshotUpload } | { ok: false; error: Problem };

// A file named .nxi is taken as ready and only checked; anything else is converted.
export async function checkScreenshot(file: FormDataEntryValue | null): Promise<ScreenshotCheck> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: "screenshot.missing" } };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: { code: "screenshot.tooLarge" } };
  }
  const data = Buffer.from(await file.arrayBuffer());
  const result = file.name.toLowerCase().endsWith(".nxi")
    ? { ...checkNxi(data), nxi: data }
    : await convertImage(data);
  if (!result.ok) {
    return result;
  }
  return { ok: true, shot: { nxi: result.nxi, width: result.width, png: await previewPng(result.nxi) } };
}

export async function appScreenshots(appId: AppId): Promise<Screenshot[]> {
  const rows = await db()
    .select()
    .from(screenshots)
    .where(eq(screenshots.appId, appId))
    .orderBy(asc(screenshots.slot));
  return rows.map((row) => ({ slot: row.slot, width: row.width, url: screenshotUrl(appId, row.slot, row.updatedAt) }));
}

export async function mainScreenshots(appIds: AppId[]): Promise<Map<AppId, Screenshot>> {
  if (appIds.length === 0) {
    return new Map();
  }
  const rows = await db()
    .select()
    .from(screenshots)
    .where(and(inArray(screenshots.appId, appIds), eq(screenshots.slot, 1)));
  return new Map(
    rows.map((row) => [row.appId, { slot: 1, width: row.width, url: screenshotUrl(row.appId, 1, row.updatedAt) }]),
  );
}

// Files first, so a row never points at a missing file.
export async function putScreenshot(username: string, appId: AppId, slot: number, shot: ScreenshotUpload) {
  await writeScreenshot(username, appId, slot, shot);
  const updatedAt = new Date();
  await db()
    .insert(screenshots)
    .values({ appId, slot, width: shot.width, updatedAt })
    .onDuplicateKeyUpdate({ set: { width: shot.width, updatedAt } });
}

export async function clearScreenshot(username: string, appId: AppId, slot: number) {
  await db()
    .delete(screenshots)
    .where(and(eq(screenshots.appId, appId), eq(screenshots.slot, slot)));
  await removeScreenshot(username, appId, slot);
}

async function slots(appId: AppId): Promise<number[]> {
  const rows = await db().select({ slot: screenshots.slot }).from(screenshots).where(eq(screenshots.appId, appId));
  return rows.map((row) => row.slot);
}

export async function binScreenshots(username: string, appId: AppId): Promise<void> {
  for (const slot of await slots(appId)) {
    await binScreenshot(username, appId, slot);
  }
}

export async function unbinScreenshots(username: string, appId: AppId): Promise<void> {
  for (const slot of await slots(appId)) {
    await unbinScreenshot(username, appId, slot);
  }
}
