"use server";

// Proxy misses server actions, so each one calls requireAdmin().

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminAddAlias,
  adminAddCategory,
  adminAddDotOverride,
  adminClearScreenshot,
  adminCreateFeature,
  adminDeleteApp,
  adminDeleteCategory,
  adminDeleteFeature,
  adminDeleteRelease,
  adminDeleteUser,
  adminDisableUser,
  adminEnableUser,
  adminGetFeature,
  adminGetUser,
  adminMoveAlias,
  adminMoveApp,
  adminPutScreenshot,
  adminRemoveAlias,
  adminRemoveDotOverride,
  adminRenameUser,
  adminRestoreApp,
  adminRestoreCategory,
  adminRestoreRelease,
  adminRevalidateApp,
  adminSetAppLimit,
  adminUnpublishFeature,
  adminUpdateApp,
  adminUpdateCategory,
  adminUpdateFeature,
  adminUpdateRelease,
  adminUpdateUser,
  adminUploadRelease,
  requireAdmin,
  type CategoryFields,
  type FeatureFields,
} from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { liveCategories } from "@/lib/categories";
import { appDotOverrides, checkUpload, formFile } from "@/lib/releases";
import { checkScreenshot } from "@/lib/screenshots";
import {
  checkArticle,
  checkCategoryChoice,
  checkCategoryName,
  checkCategorySlug,
  checkChangelog,
  checkDescription,
  checkRequiredInstallDir,
  checkPublishAt,
  checkReleaseDate,
  checkTitle,
  checkUsernameInput,
  checkVersion,
  parseLimit,
  parseSerial,
  parseSlot,
  parseSpecificity,
} from "@/lib/rules";
import { DEFAULT_APP_LIMIT } from "@/lib/settings";
import type { Problem } from "@/lib/problems";
import type { AppRevalidation } from "@/lib/revalidate";
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
  const dir = checkRequiredInstallDir(text(formData, "installDir"));
  if (!dir.ok) {
    return { error: dir.error };
  }
  const values = formData
    .getAll("categories")
    .filter((value) => typeof value === "string")
    .map(Number);
  const choice = checkCategoryChoice(values, (await liveCategories()).map((category) => category.id));
  if (!choice.ok) {
    return { error: choice.error };
  }
  const result = await adminUpdateApp(appId, { title, description, installDir: dir.installDir }, choice.ids);
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
    await formFile(formData.get("file")),
    await appDotOverrides(appId),
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
  const checked = await checkScreenshot(await formFile(formData.get("file")));
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

export async function addAdminAlias(rawId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const { error } = await adminAddAlias(appId, text(formData, "alias"));
  if (error) {
    return { error };
  }
  revalidatePath(appPath(appId));
  return { saved: true };
}

export async function moveAdminAlias(
  rawId: string,
  alias: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const { error } = await adminMoveAlias(appId, alias, text(formData, "target"));
  if (error) {
    return { error };
  }
  revalidatePath(appPath(appId));
  return { saved: true };
}

export async function removeAdminAlias(rawId: string, alias: string): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (appId) {
    await adminRemoveAlias(appId, alias);
    revalidatePath(appPath(appId));
  }
}

export async function addAdminDotOverride(rawId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const { error } = await adminAddDotOverride(appId, text(formData, "name"));
  if (error) {
    return { error };
  }
  revalidatePath(appPath(appId));
  return { saved: true };
}

export async function removeAdminDotOverride(rawId: string, name: string): Promise<void> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  if (appId) {
    await adminRemoveDotOverride(appId, name);
    revalidatePath(appPath(appId));
  }
}

export type RevalidateState = { error?: Problem; result?: AppRevalidation };

export async function revalidateAdminApp(rawId: string): Promise<RevalidateState> {
  await requireAdmin();
  const appId = parseAppId(rawId);
  const result = appId ? await adminRevalidateApp(appId) : null;
  return result ? { result } : { error: { code: "app.notFound" } };
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

function categoryInput(formData: FormData): { fields: CategoryFields; error: Problem | null } {
  const slug = text(formData, "slug");
  const name = text(formData, "name");
  const dir = checkRequiredInstallDir(text(formData, "installDir"));
  const specificity = parseSpecificity(text(formData, "specificity"));
  const fields = {
    slug,
    name,
    installDir: dir.ok ? dir.installDir : "",
    specificity: specificity.ok ? specificity.specificity : 0,
  };
  const error =
    checkCategorySlug(slug) ??
    checkCategoryName(name) ??
    (dir.ok ? null : dir.error) ??
    (specificity.ok ? null : specificity.error);
  return { fields, error };
}

export async function addAdminCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { fields, error } = categoryInput(formData);
  if (error) {
    return { error };
  }
  const result = await adminAddCategory(fields);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/admin/categories");
  return { saved: true };
}

export async function saveAdminCategory(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { fields, error } = categoryInput(formData);
  if (error) {
    return { error };
  }
  const result = await adminUpdateCategory(id, fields);
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

const FEATURED_PATH = "/admin/featured";

// A published feature stays published on save; unpublish is its own action.
function featureFields(
  formData: FormData,
  stored: { published: boolean; publishAt: Date | null } | null,
): { error: Problem } | FeatureFields {
  const article = checkArticle(text(formData, "article"));
  if (!article.ok) {
    return { error: article.error };
  }
  const time = checkPublishAt(text(formData, "publishAt"), stored?.publishAt ?? null, new Date());
  if (!time.ok) {
    return { error: time.error };
  }
  const published = stored?.published === true || text(formData, "intent") === "publish";
  return { article: article.article, published, publishAt: time.publishAt ?? (published ? "now" : null) };
}

export async function createAdminFeature(rawAppId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const appId = parseAppId(rawAppId);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const fields = featureFields(formData, null);
  if ("error" in fields) {
    return { error: fields.error };
  }
  const result = await adminCreateFeature(appId, fields);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(FEATURED_PATH);
  redirect(FEATURED_PATH);
}

export async function saveAdminFeature(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const feature = await adminGetFeature(id);
  if (!feature) {
    return { error: { code: "feature.notFound" } };
  }
  const fields = featureFields(formData, feature);
  if ("error" in fields) {
    return { error: fields.error };
  }
  const result = await adminUpdateFeature(id, fields);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(FEATURED_PATH);
  redirect(FEATURED_PATH);
}

export async function unpublishAdminFeature(id: number): Promise<FormState> {
  await requireAdmin();
  const result = await adminUnpublishFeature(id);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(FEATURED_PATH);
  redirect(FEATURED_PATH);
}

export async function deleteAdminFeature(id: number): Promise<FormState> {
  await requireAdmin();
  const result = await adminDeleteFeature(id);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath(FEATURED_PATH);
  redirect(FEATURED_PATH);
}
