"use server";

import { and, eq, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { apps, releases, users } from "@/db/schema";
import { allocateAppId, deleteApp, parseAppId, type AppId } from "@/lib/apps";
import { db } from "@/lib/db";
import {
  checkDescription,
  checkReleaseDate,
  checkTitle,
  checkUsernameInput,
  checkVersion,
  checkVersionUnused,
  MAX_UPLOAD_BYTES,
  SERIAL_MAX,
  usernameKey,
  canCreateApp,
  parseSerial,
} from "@/lib/rules";
import { appCount, appLimit } from "@/lib/limits";
import { requirePublisher, requireUser } from "@/lib/session";
import { releasePath, removeFile, writeRelease } from "@/lib/storage";
import { checkZip } from "@/lib/zip";
import type { Problem } from "@/lib/problems";

export type FormState = { error?: Problem; saved?: boolean };

export type UploadState = { error?: Problem };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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
  const taken = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, usernameKey(username)))
    .limit(1);
  if (taken.length > 0) {
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
  await db().insert(apps).values({ id, userId: user.id, title, description });
  redirect(`/apps/${id}`);
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
  await db().update(apps).set({ title, description }).where(eq(apps.id, appId));
  revalidatePath(`/apps/${appId}`);
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
  const version = text(formData, "version");
  const versionError = checkVersion(version);
  if (versionError) {
    return { error: versionError };
  }
  const date = checkReleaseDate(text(formData, "releaseDate"), new Date());
  if (!date.ok) {
    return { error: date.error };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: { code: "file.missing" } };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: { code: "file.tooLarge" } };
  }
  const data = Buffer.from(await file.arrayBuffer());
  const zip = await checkZip(data);
  if (!zip.ok) {
    return { error: zip.error };
  }

  const result = await db().transaction(async (tx): Promise<{ error: Problem } | { serial: number }> => {
    const [app] = await tx
      .select()
      .from(apps)
      .where(and(eq(apps.id, appId), eq(apps.userId, user.id), isNull(apps.deletedAt)))
      .for("update");
    if (!app) {
      return { error: { code: "app.notFound" } };
    }
    const existing = await tx
      .select({ version: releases.version })
      .from(releases)
      .where(eq(releases.appId, appId));
    const taken = checkVersionUnused(version, existing.map((row) => row.version));
    if (taken) {
      return { error: taken };
    }
    const [last] = await tx
      .select({ serial: max(releases.serial) })
      .from(releases)
      .where(eq(releases.appId, appId));
    const serial = (last?.serial ?? 0) + 1;
    if (serial > SERIAL_MAX) {
      return { error: { code: "app.releasesFull", max: SERIAL_MAX } };
    }
    const filePath = releasePath(user.username, appId, serial);
    await writeRelease(filePath, data);
    try {
      await tx.insert(releases).values({ appId, serial, version, releaseDate: date.day });
    } catch (err) {
      await removeFile(filePath);
      throw err;
    }
    return { serial };
  });
  if ("error" in result) {
    return { error: result.error };
  }
  revalidatePath(`/apps/${appId}`);
  redirect(`/apps/${appId}/releases/${result.serial}`);
}

export async function removeApp(rawId: string): Promise<void> {
  const appId = parseAppId(rawId);
  const user = await requirePublisher();
  if (!appId || !(await ownedApp(user.id, appId))) {
    redirect("/");
  }
  await deleteApp(
    {
      async markDeleted(id) {
        await db()
          .update(apps)
          .set({ deletedAt: new Date() })
          .where(eq(apps.id, id));
      },
      async releaseFilePaths(id) {
        const rows = await db()
          .select({ serial: releases.serial })
          .from(releases)
          .where(eq(releases.appId, id));
        return rows.map((row) => releasePath(user.username, id, row.serial));
      },
      removeFile,
    },
    appId,
  );
  redirect("/");
}

export async function removeRelease(rawId: string, rawSerial: number): Promise<void> {
  const appId = parseAppId(rawId);
  const serial = parseSerial(String(rawSerial));
  const user = await requirePublisher();
  if (!appId || !serial || !(await ownedApp(user.id, appId))) {
    redirect("/");
  }
  const [release] = await db()
    .select({ deletedAt: releases.deletedAt })
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  if (release && !release.deletedAt) {
    // Mark first: a failed unlink then leaves a stray file, not a release without one.
    await db()
      .update(releases)
      .set({ deletedAt: new Date() })
      .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
    await removeFile(releasePath(user.username, appId, serial));
  }
  revalidatePath(`/apps/${appId}`);
  redirect(`/apps/${appId}/releases/${serial}`);
}
