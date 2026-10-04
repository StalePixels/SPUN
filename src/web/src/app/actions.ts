"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { users } from "@/db/schema";
import { addApp, deleteOwnApp, editApp, parseAppId, type AppFields } from "@/lib/apps";
import { db } from "@/lib/db";
import { isDuplicateEntry } from "@/lib/dberrors";
import { checkUsernameInput, parseSerial, parseSlot } from "@/lib/rules";
import { deleteOwnRelease, editChangelog, uploadOwnRelease } from "@/lib/releases";
import { saveApp, unsaveApp } from "@/lib/saved";
import { clearOwnScreenshot, uploadOwnScreenshot } from "@/lib/screenshots";
import { requirePublisher, requireUser } from "@/lib/session";
import { usernameTaken } from "@/lib/usernames";
import type { Problem } from "@/lib/problems";

export type FormState = { error?: Problem; saved?: boolean };

export type UploadState = { error?: Problem };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function appFields(formData: FormData): AppFields {
  return {
    title: text(formData, "title"),
    description: text(formData, "description"),
    installDir: text(formData, "installDir"),
    categories: formData
      .getAll("categories")
      .filter((value) => typeof value === "string")
      .map(Number),
  };
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
    if (isDuplicateEntry(err)) {
      return { error: { code: "username.taken" } };
    }
    throw err;
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createApp(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePublisher();
  const result = await addApp(user.id, appFields(formData));
  if ("error" in result) {
    return { error: result.error };
  }
  redirect(`/publish/apps/${result.id}`);
}

export async function updateApp(
  rawId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const { error } = await editApp(user.id, appId, async () => appFields(formData));
  if (error) {
    return { error };
  }
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
  const result = await uploadOwnRelease(user.id, appId, async () => formData);
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath(`/publish/apps/${appId}`);
  redirect(`/publish/apps/${appId}/releases/${result.serial}`);
}

export async function removeApp(rawId: string): Promise<void> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (appId) {
    await deleteOwnApp(user, appId);
  }
  redirect("/publish");
}

export async function removeRelease(rawId: string, rawSerial: number): Promise<void> {
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  const user = await requirePublisher();
  if (!appId || !serial) {
    redirect("/publish");
  }
  const { error } = await deleteOwnRelease(user, appId, serial);
  if (error?.code === "app.notFound") {
    redirect("/publish");
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
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  if (!serial) {
    return { error: { code: "release.notFound" } };
  }
  const { error } = await editChangelog(user.id, appId, serial, async () => text(formData, "changelog"));
  if (error) {
    return { error };
  }
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
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  if (!slot) {
    return { error: { code: "screenshot.notFound" } };
  }
  const result = await uploadOwnScreenshot(user, appId, slot, async () => formData);
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath(`/publish/apps/${appId}`);
  return {};
}

export async function removeScreenshot(rawId: string, rawSlot: number): Promise<void> {
  const appId = parseAppId(rawId);
  const slot = parseSlot(String(rawSlot));
  const user = await requirePublisher();
  if (appId && slot && !(await clearOwnScreenshot(user, appId, slot)).error) {
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
