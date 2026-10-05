import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { screenshots } from "@/db/schema";
import { ownedApp, type AppId } from "./apps";
import { db } from "./db";
import { notify } from "./notify";
import { checkNxi, convertImage, oneAtATime, previewPng, type NxiWidth } from "./nxi";
import type { Problem } from "./problems";
import { makeThumbnail } from "./thumbs";
import { formFile, uploadRate, type UploadFile } from "./releases";
import { MAX_SCREENSHOT_BYTES, screenshotUrl } from "./rules";
import { binScreenshot, removeScreenshot, unbinScreenshot, writeScreenshot } from "./storage";

export type Screenshot = { slot: number; width: number; url: string };

export type ScreenshotUpload = { nxi: Buffer; png: Buffer; width: NxiWidth };

export type ScreenshotCheck = { ok: true; shot: ScreenshotUpload } | { ok: false; error: Problem };

// A file named .nxi is taken as ready and only checked; anything else is converted.
export async function checkScreenshot(file: UploadFile | null): Promise<ScreenshotCheck> {
  if (!file || file.data.length === 0) {
    return { ok: false, error: { code: "screenshot.missing" } };
  }
  if (file.data.length > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: { code: "screenshot.tooLarge" } };
  }
  return oneAtATime(async (): Promise<ScreenshotCheck> => {
    const result = file.name.toLowerCase().endsWith(".nxi")
      ? { ...checkNxi(file.data), nxi: file.data }
      : await convertImage(file.data);
    if (!result.ok) {
      return result;
    }
    return { ok: true, shot: { nxi: result.nxi, width: result.width, png: await previewPng(result.nxi) } };
  });
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
export async function putScreenshot(
  username: string,
  appId: AppId,
  slot: number,
  shot: ScreenshotUpload,
): Promise<"added" | "replaced"> {
  const action = (await slots(appId)).includes(slot) ? "replaced" : "added";
  await writeScreenshot(username, appId, slot, { ...shot, thumb: makeThumbnail(shot.nxi, slot)! });
  const updatedAt = new Date();
  await db()
    .insert(screenshots)
    .values({ appId, slot, width: shot.width, updatedAt })
    .onDuplicateKeyUpdate({ set: { width: shot.width, updatedAt } });
  return action;
}

// True if the slot had a screenshot.
export async function clearScreenshot(username: string, appId: AppId, slot: number): Promise<boolean> {
  const had = (await slots(appId)).includes(slot);
  await db()
    .delete(screenshots)
    .where(and(eq(screenshots.appId, appId), eq(screenshots.slot, slot)));
  await removeScreenshot(username, appId, slot);
  return had;
}

// The form comes through a callback so an upload to someone else's app is never read.
export async function uploadOwnScreenshot(
  user: { id: string; username: string },
  appId: AppId,
  slot: number,
  readForm: () => Promise<FormData>,
): Promise<{ error: Problem } | { width: NxiWidth }> {
  if (!(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const limited = await uploadRate(user.id);
  if (limited) {
    return { error: limited };
  }
  const checked = await checkScreenshot(await formFile((await readForm()).get("file")));
  if (!checked.ok) {
    return { error: checked.error };
  }
  const action = await putScreenshot(user.username, appId, slot, checked.shot);
  notify({ kind: "screenshot", actorId: user.id, appId, slot, action });
  return { width: checked.shot.width };
}

export async function clearOwnScreenshot(
  user: { id: string; username: string },
  appId: AppId,
  slot: number,
): Promise<{ error?: Problem }> {
  if (!(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  if (!(await slots(appId)).includes(slot)) {
    return { error: { code: "screenshot.notFound" } };
  }
  await clearScreenshot(user.username, appId, slot);
  notify({ kind: "screenshot", actorId: user.id, appId, slot, action: "removed" });
  return {};
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
