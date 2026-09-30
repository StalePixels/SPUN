"use server";

// Proxy misses server actions, so each one calls requireAdmin().

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminAddCategory,
  adminClearScreenshot,
  adminDeleteApp,
  adminDeleteCategory,
  adminDeleteRelease,
  adminDeleteUser,
  adminDisableUser,
  adminEnableUser,
  adminGetUser,
  adminMoveApp,
  adminPutScreenshot,
  adminRenameUser,
  adminRestoreApp,
  adminRestoreCategory,
  adminRestoreRelease,
  adminSetAppLimit,
  adminUpdateApp,
  adminUpdateCategory,
  adminUpdateRelease,
  adminUpdateUser,
  adminUploadRelease,
  requireAdmin,
} from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { liveCategories } from "@/lib/categories";
import { checkUpload } from "@/lib/releases";
import { checkScreenshot } from "@/lib/screenshots";
import {
  checkCategoryChoice,
  checkCategoryName,
  checkCategorySlug,
  checkChangelog,
  checkDescription,
  checkReleaseDate,
  checkTitle,
  checkUsernameInput,
  checkVersion,
  parseLimit,
  parseSerial,
  parseSlot,
} from "@/lib/rules";
import { DEFAULT_APP_LIMIT } from "@/lib/settings";
import type { Problem } from "@/lib/problems";
import type { FormState, UploadState } from "../actions";

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const limit = parseLimit(String(formData.get(DEFAULT_APP_LIMIT) ?? ""));
  if (!limit.ok) {
    return { error: limit.error };
  }
  await adminSetAppLimit(limit.limit);
  revalidatePath("/admin/settings");
  return { saved: true };
}

export async function saveUser(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const user = await adminGetUser(userId);
  if (!user) {
    return { error: { code: "user.notFound" } };
  }
  const limit =
    formData.get("ownLimit") === "on"
      ? parseLimit(String(formData.get("appLimit") ?? ""))
      : ({ ok: true, limit: null } as const);
  if (!limit.ok) {
    return { error: limit.error };
  }
  if (formData.get("ownLimit") === "on" && limit.limit === null) {
    return { error: { code: "limit.missing" } };
  }
  const result = await adminUpdateUser(userId, {
    appLimit: limit.limit,
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { saved: true };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function appPath(appId: string): string {
  return `/admin/apps/${appId}`;
}

export async function saveAdminApp(rawId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const title = text(formData, "title");
  const description = text(formData, "description");
  const error = checkTitle(title) ?? checkDescription(description);
  if (error) {
    return { error };
  }
  const values = formData.getAll("categories").filter((value) => typeof value === "string");
  const choice = checkCategoryChoice(values, (await liveCategories()).map((category) => category.id));
  if (!choice.ok) {
    return { error: choice.error };
  }
  const result = await adminUpdateApp(appId, { title, description }, choice.ids);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(appPath(appId));
  return { saved: true };
}

export async function uploadAdminRelease(
  rawId: string,
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
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
  const result = await adminUploadRelease(appId, checked.upload);
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath(appPath(appId));
  redirect(`${appPath(appId)}/releases/${result.serial}`);
}

export async function deleteAdminApp(rawId: string): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    redirect("/admin/apps");
  }
  await adminDeleteApp(appId);
  revalidatePath(appPath(appId));
  redirect(appPath(appId));
}

export async function restoreAdminApp(rawId: string): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    redirect("/admin/apps");
  }
  await adminRestoreApp(appId);
  revalidatePath(appPath(appId));
  redirect(appPath(appId));
}

export async function uploadAdminScreenshot(
  rawId: string,
  rawSlot: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const slot = parseSlot(String(rawSlot));
  if (!appId || !slot) {
    return { error: { code: "app.notFound" } };
  }
  const checked = await checkScreenshot(formData.get("file"));
  if (!checked.ok) {
    return { error: checked.error };
  }
  const result = await adminPutScreenshot(appId, slot, checked.shot);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(appPath(appId));
  return {};
}

export async function clearAdminScreenshot(rawId: string, rawSlot: number): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const slot = parseSlot(String(rawSlot));
  if (appId && slot) {
    await adminClearScreenshot(appId, slot);
    revalidatePath(appPath(appId));
  }
}

export async function moveAdminApp(rawId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const result = await adminMoveApp(appId, text(formData, "userId"));
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(appPath(appId));
  return { saved: true };
}

export async function saveAdminRelease(
  rawId: string,
  rawSerial: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  if (!appId || !serial) {
    return { error: { code: "app.notFound" } };
  }
  const version = text(formData, "version");
  const versionError = checkVersion(version);
  if (versionError) {
    return { error: versionError };
  }
  const date = checkReleaseDate(text(formData, "releaseDate"), new Date());
  if (!date.ok) {
    return { error: date.error };
  }
  const log = checkChangelog(text(formData, "changelog"));
  if (!log.ok) {
    return { error: log.error };
  }
  const result = await adminUpdateRelease(appId, serial, {
    version,
    releaseDate: date.day,
    changelog: log.changelog,
  });
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(`${appPath(appId)}/releases/${serial}`);
  return { saved: true };
}

export async function deleteAdminRelease(rawId: string, rawSerial: number): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  if (!appId || !serial) {
    redirect("/admin/apps");
  }
  await adminDeleteRelease(appId, serial);
  revalidatePath(appPath(appId));
  redirect(`${appPath(appId)}/releases/${serial}`);
}

export async function restoreAdminRelease(rawId: string, rawSerial: number): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  if (!appId || !serial) {
    redirect("/admin/apps");
  }
  await adminRestoreRelease(appId, serial);
  revalidatePath(appPath(appId));
  redirect(`${appPath(appId)}/releases/${serial}`);
}

function userPaths(userId: string): void {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function renameAdminUser(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const username = text(formData, "username");
  const error = checkUsernameInput(username);
  if (error) {
    return { error };
  }
  const result = await adminRenameUser(userId, username);
  if (result.error) {
    return { error: result.error };
  }
  userPaths(userId);
  return { saved: true };
}

export async function disableAdminUser(userId: string): Promise<FormState> {
  await requireAdmin();
  const result = await adminDisableUser(userId);
  if (result.error) {
    return { error: result.error };
  }
  userPaths(userId);
  return {};
}

export async function enableAdminUser(userId: string): Promise<FormState> {
  await requireAdmin();
  await adminEnableUser(userId);
  userPaths(userId);
  return {};
}

export async function deleteAdminUser(userId: string): Promise<FormState> {
  await requireAdmin();
  const result = await adminDeleteUser(userId);
  if (result.error) {
    return { error: result.error };
  }
  userPaths(userId);
  return {};
}

function categoryInput(formData: FormData): { slug: string; name: string; error: Problem | null } {
  const slug = text(formData, "slug");
  const name = text(formData, "name");
  return { slug, name, error: checkCategorySlug(slug) ?? checkCategoryName(name) };
}

export async function addAdminCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { slug, name, error } = categoryInput(formData);
  if (error) {
    return { error };
  }
  const result = await adminAddCategory(slug, name);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/admin/categories");
  return { saved: true };
}

export async function saveAdminCategory(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { slug, name, error } = categoryInput(formData);
  if (error) {
    return { error };
  }
  const result = await adminUpdateCategory(id, slug, name);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/admin/categories");
  return { saved: true };
}

export async function deleteAdminCategory(id: number): Promise<void> {
  await requireAdmin();
  await adminDeleteCategory(id);
  revalidatePath("/admin/categories");
}

export async function restoreAdminCategory(id: number): Promise<void> {
  await requireAdmin();
  await adminRestoreCategory(id);
  revalidatePath("/admin/categories");
}
