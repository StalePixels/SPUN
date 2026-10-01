"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { apps, releases, users } from "@/db/schema";
import { allocateAppId, deleteApp, parseAppId, type AppId } from "@/lib/apps";
import { db } from "@/lib/db";
import { liveCategories, setAppCategories } from "@/lib/categories";
import {
  checkCategoryChoice,
  checkChangelog,
  checkDescription,
  checkTitle,
  checkUsernameInput,
  canCreateApp,
  parseSerial,
  parseSlot,
} from "@/lib/rules";
import { appCount, appLimit } from "@/lib/limits";
import { addRelease, appBinStore, checkUpload } from "@/lib/releases";
import { saveApp, unsaveApp } from "@/lib/saved";
import { checkScreenshot, clearScreenshot, putScreenshot } from "@/lib/screenshots";
import { requirePublisher, requireUser } from "@/lib/session";
import { binRelease } from "@/lib/storage";
import { usernameTaken } from "@/lib/usernames";
import type { Problem } from "@/lib/problems";

export type FormState = { error?: Problem; saved?: boolean };

export type UploadState = { error?: Problem };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function categoryChoice(formData: FormData) {
  const values = formData.getAll("categories").filter((value) => typeof value === "string");
  return checkCategoryChoice(values, (await liveCategories()).map((category) => category.id));
}

export async function logIn(): Promise<void> {
  await signIn("nbn", { redirectTo: "/" });
}

export async function logOut(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function chooseUsername(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.username) {
    return { error: { code: "username.fixed" } };
  }
  const username = text(formData, "username");
  const error = checkUsernameInput(username);
  if (error) {
    return { error };
  }
  if (await usernameTaken(username)) {
    return { error: { code: "username.taken" } };
  }
  try {
    await db()
      .update(users)
      .set({ username })
      .where(and(eq(users.id, user.id), isNull(users.username)));
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      return { error: { code: "username.taken" } };
    }
    throw err;
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createApp(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePublisher();
  const title = text(formData, "title");
  const description = text(formData, "description");
  const error = checkTitle(title) ?? checkDescription(description);
  if (error) {
    return { error };
  }
  const choice = await categoryChoice(formData);
  if (!choice.ok) {
    return { error: choice.error };
  }
  const limit = await appLimit(user.id);
  if (!canCreateApp(await appCount(user.id), limit)) {
    return { error: { code: "app.limitReached", limit } };
  }
  const id = await allocateAppId({
    async idExists(candidate) {
      const rows = await db().select({ id: apps.id }).from(apps).where(eq(apps.id, candidate));
      return rows.length > 0;
    },
  });
  await db().transaction(async (tx) => {
    await tx.insert(apps).values({ id, userId: user.id, title, description });
    await setAppCategories(tx, id, choice.ids);
  });
  redirect(`/publish/apps/${id}`);
}

async function ownedApp(userId: string, appId: AppId) {
  const rows = await db()
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.userId, userId), isNull(apps.deletedAt)));
  return rows[0];
}

export async function updateApp(
  rawId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (!appId || !(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const title = text(formData, "title");
  const description = text(formData, "description");
  const error = checkTitle(title) ?? checkDescription(description);
  if (error) {
    return { error };
  }
  const choice = await categoryChoice(formData);
  if (!choice.ok) {
    return { error: choice.error };
  }
  await db().transaction(async (tx) => {
    await tx.update(apps).set({ title, description }).where(eq(apps.id, appId));
    await setAppCategories(tx, appId, choice.ids);
  });
  revalidatePath(`/publish/apps/${appId}`);
  return { saved: true };
}

export async function uploadRelease(
  rawId: string,
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const checked = await checkUpload(
    text(formData, "version"),
    text(formData, "releaseDate"),
    text(formData, "changelog"),
    formData.get("file"),
  );
  if (!checked.ok) {
    return { error: checked.error };
  }
  const result = await addRelease(appId, user.id, checked.upload);
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath(`/publish/apps/${appId}`);
  redirect(`/publish/apps/${appId}/releases/${result.serial}`);
}

export async function removeApp(rawId: string): Promise<void> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (!appId || !(await ownedApp(user.id, appId))) {
    redirect("/publish");
  }
  await deleteApp(appBinStore(user.username), appId);
  redirect("/publish");
}

export async function removeRelease(rawId: string, rawSerial: number): Promise<void> {
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  const user = await requirePublisher();
  if (!appId || !serial || !(await ownedApp(user.id, appId))) {
    redirect("/publish");
  }
  const [release] = await db()
    .select({ deletedAt: releases.deletedAt })
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  if (release && !release.deletedAt) {
    // Mark first: a failed move then leaves a stray file, not a release without one.
    await db()
      .update(releases)
      .set({ deletedAt: new Date() })
      .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
    await binRelease(user.username, appId, serial);
  }
  revalidatePath(`/publish/apps/${appId}`);
  redirect(`/publish/apps/${appId}/releases/${serial}`);
}

export async function saveChangelog(
  rawId: string,
  rawSerial: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  const user = await requirePublisher();
  if (!appId || !serial || !(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const log = checkChangelog(text(formData, "changelog"));
  if (!log.ok) {
    return { error: log.error };
  }
  await db()
    .update(releases)
    .set({ changelog: log.changelog })
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial), isNull(releases.deletedAt)));
  revalidatePath(`/publish/apps/${appId}/releases/${serial}`);
  return { saved: true };
}

export async function uploadScreenshot(
  rawId: string,
  rawSlot: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const appId = parseAppId(rawId);
  const slot = parseSlot(String(rawSlot));
  const user = await requirePublisher();
  if (!appId || !slot || !(await ownedApp(user.id, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const checked = await checkScreenshot(formData.get("file"));
  if (!checked.ok) {
    return { error: checked.error };
  }
  await putScreenshot(user.username, appId, slot, checked.shot);
  revalidatePath(`/publish/apps/${appId}`);
  return {};
}

export async function removeScreenshot(rawId: string, rawSlot: number): Promise<void> {
  const appId = parseAppId(rawId);
  const slot = parseSlot(String(rawSlot));
  const user = await requirePublisher();
  if (appId && slot && (await ownedApp(user.id, appId))) {
    await clearScreenshot(user.username, appId, slot);
    revalidatePath(`/publish/apps/${appId}`);
  }
}

// The wanted state, not a toggle, so a repeated submit changes nothing.
export async function setSaved(rawId: string, saved: boolean): Promise<void> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (appId) {
    await (saved ? saveApp(user.id, appId) : unsaveApp(user.id, appId));
  }
  refresh();
}
