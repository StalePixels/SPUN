import "server-only";
import { and, eq, isNull, max } from "drizzle-orm";
import { apps, dotOverrides, releases, users } from "@/db/schema";
import { ownedApp, type AppBinStore, type AppId } from "./apps";
import { db } from "./db";
import { checkDotMoves, dotMoves, type DotMove } from "./dotcommands";
import type { Problem } from "./problems";
import {
  checkChangelog,
  checkReleaseDate,
  checkVersion,
  checkVersionUnused,
  isoDay,
  MAX_UPLOAD_BYTES,
  releaseFileName,
  SERIAL_MAX,
} from "./rules";
import { binScreenshots, unbinScreenshots } from "./screenshots";
import { apiLimits } from "./apigate";
import { countHit } from "./redis";
import { binRelease, readRelease, releasePath, removeFile, unbinRelease, writeRelease } from "./storage";
import { checkUploadRate } from "./uploadlimit";
import { fieldChanges } from "./notices";
import { notify, releaseSnapshot } from "./notify";
import { checkZip } from "./zip";

export type Upload = {
  version: string;
  day: string;
  changelog: string | null;
  data: Buffer;
  files: string[];
  dotMoves: DotMove[];
};

export type UploadFile = { name: string; data: Buffer };

export type OwnReleaseView = {
  appTitle: string;
  serial: number;
  version: string;
  releaseDate: string;
  changelog: string | null;
  deletedDay: string | null;
  path: string;
  files: string[] | null;
  dotMoves: DotMove[];
};

export type UploadCheck = { ok: true; upload: Upload } | { ok: false; error: Problem };

export async function checkUpload(
  version: string,
  releaseDate: string,
  changelog: string,
  file: UploadFile | null,
  overrides: string[],
): Promise<UploadCheck> {
  const versionError = checkVersion(version);
  if (versionError) {
    return { ok: false, error: versionError };
  }
  const date = checkReleaseDate(releaseDate, new Date());
  if (!date.ok) {
    return { ok: false, error: date.error };
  }
  const log = checkChangelog(changelog);
  if (!log.ok) {
    return { ok: false, error: log.error };
  }
  if (!file || file.data.length === 0) {
    return { ok: false, error: { code: "file.missing" } };
  }
  if (file.data.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: { code: "file.tooLarge" } };
  }
  const zip = await checkZip(file.data);
  if (!zip.ok) {
    return { ok: false, error: zip.error };
  }
  const moves = dotMoves(zip.entries);
  const clash = checkDotMoves(moves, overrides);
  if (clash) {
    return { ok: false, error: clash };
  }
  return {
    ok: true,
    upload: { version, day: date.day, changelog: log.changelog, data: file.data, files: zip.entries, dotMoves: moves },
  };
}

export async function appDotOverrides(appId: AppId): Promise<string[]> {
  const rows = await db().select({ name: dotOverrides.name }).from(dotOverrides).where(eq(dotOverrides.appId, appId));
  return rows.map((row) => row.name);
}

export async function uploadRate(userId: string): Promise<Problem | null> {
  return checkUploadRate({ nowMs: () => Date.now(), count: countHit }, userId, apiLimits().uploadsPerHour);
}

export async function formFile(value: FormDataEntryValue | null): Promise<UploadFile | null> {
  return value instanceof File ? { name: value.name, data: Buffer.from(await value.arrayBuffer()) } : null;
}

export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// The form comes through a callback so an upload to someone else's app is never read.
export async function uploadOwnRelease(
  userId: string,
  appId: AppId,
  readForm: () => Promise<FormData>,
): Promise<{ error: Problem } | { serial: number; dotMoves: DotMove[] }> {
  if (!(await ownedApp(userId, appId))) {
    return { error: { code: "app.notFound" } };
  }
  const limited = await uploadRate(userId);
  if (limited) {
    return { error: limited };
  }
  const form = await readForm();
  const checked = await checkUpload(
    formText(form, "version"),
    formText(form, "releaseDate"),
    formText(form, "changelog"),
    await formFile(form.get("file")),
    await appDotOverrides(appId),
  );
  if (!checked.ok) {
    return { error: checked.error };
  }
  const result = await addRelease(appId, userId, checked.upload);
  if ("error" in result) {
    return result;
  }
  notifyRelease(userId, appId, result.serial, checked.upload);
  return { serial: result.serial, dotMoves: checked.upload.dotMoves };
}

export function notifyRelease(actorId: string, appId: AppId, serial: number, upload: Upload): void {
  notify({
    kind: "releaseUploaded",
    actorId,
    appId,
    serial,
    version: upload.version,
    releaseDate: upload.day,
    changelog: upload.changelog,
    files: upload.files,
    dotMoves: upload.dotMoves,
  });
}

export async function notifyReleaseEdit(
  actorId: string,
  appId: AppId,
  serial: number,
  before: Record<string, string>,
): Promise<void> {
  const after = await releaseSnapshot(appId, serial);
  const changes = fieldChanges(before, after);
  if (changes.length > 0) {
    notify({ kind: "releaseEdited", actorId, appId, serial, version: after.Version, changes });
  }
}

// ownerId null is the admin upload: any owner. The file goes under the owner's username.
export async function addRelease(
  appId: AppId,
  ownerId: string | null,
  upload: Upload,
): Promise<{ error: Problem } | { serial: number }> {
  return db().transaction(async (tx): Promise<{ error: Problem } | { serial: number }> => {
    const [app] = await tx
      .select({ username: users.username })
      .from(apps)
      .innerJoin(users, eq(users.id, apps.userId))
      .where(
        and(
          eq(apps.id, appId),
          isNull(apps.deletedAt),
          ownerId === null ? undefined : eq(apps.userId, ownerId),
        ),
      )
      .for("update");
    if (!app) {
      return { error: { code: "app.notFound" } };
    }
    if (!app.username) {
      throw new Error(`The owner of app ${appId} has no username.`);
    }
    const existing = await tx
      .select({ version: releases.version })
      .from(releases)
      .where(eq(releases.appId, appId));
    const taken = checkVersionUnused(upload.version, existing.map((row) => row.version));
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
    const filePath = releasePath(app.username, appId, serial);
    await writeRelease(filePath, upload.data);
    try {
      await tx
        .insert(releases)
        .values({ appId, serial, version: upload.version, releaseDate: upload.day, changelog: upload.changelog });
    } catch (err) {
      await removeFile(filePath);
      throw err;
    }
    return { serial };
  });
}

async function ownRelease(
  userId: string,
  appId: AppId,
  serial: number,
): Promise<{ error: Problem } | { app: typeof apps.$inferSelect; release: typeof releases.$inferSelect }> {
  const app = await ownedApp(userId, appId);
  if (!app) {
    return { error: { code: "app.notFound" } };
  }
  const [release] = await db()
    .select()
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  return release ? { app, release } : { error: { code: "release.notFound" } };
}

export async function editChangelog(
  userId: string,
  appId: AppId,
  serial: number,
  readChangelog: () => Promise<string>,
): Promise<{ error?: Problem }> {
  const found = await ownRelease(userId, appId, serial);
  if ("error" in found) {
    return { error: found.error };
  }
  if (found.release.deletedAt) {
    return { error: { code: "release.notFound" } };
  }
  const log = checkChangelog(await readChangelog());
  if (!log.ok) {
    return { error: log.error };
  }
  const before = await releaseSnapshot(appId, serial);
  await db()
    .update(releases)
    .set({ changelog: log.changelog })
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial), isNull(releases.deletedAt)));
  await notifyReleaseEdit(userId, appId, serial, before);
  return {};
}

export async function deleteOwnRelease(
  user: { id: string; username: string },
  appId: AppId,
  serial: number,
): Promise<{ error?: Problem }> {
  const found = await ownRelease(user.id, appId, serial);
  if ("error" in found) {
    return { error: found.error };
  }
  if (found.release.deletedAt) {
    return { error: { code: "release.notFound" } };
  }
  // Mark first: a failed move then leaves a stray file, not a release without one.
  await db()
    .update(releases)
    .set({ deletedAt: new Date() })
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  await binRelease(user.username, appId, serial);
  notify({ kind: "releaseDeleted", actorId: user.id, appId, serial, version: found.release.version });
  return {};
}

export async function ownReleaseView(
  user: { id: string; username: string },
  appId: AppId,
  serial: number,
): Promise<{ error: Problem } | { value: OwnReleaseView }> {
  const found = await ownRelease(user.id, appId, serial);
  if ("error" in found) {
    return { error: found.error };
  }
  const { app, release } = found;
  const data = release.deletedAt ? null : await readRelease(releasePath(user.username, appId, serial));
  const zip = data ? await checkZip(data) : null;
  return {
    value: {
      appTitle: app.title,
      serial,
      version: release.version,
      releaseDate: release.releaseDate,
      changelog: release.changelog,
      deletedDay: release.deletedAt ? isoDay(release.deletedAt) : null,
      path: `/${user.username}/${releaseFileName(appId, serial)}`,
      files: zip?.ok ? zip.entries : null,
      dotMoves: zip?.ok ? dotMoves(zip.entries) : [],
    },
  };
}

export function appBinStore(username: string): AppBinStore {
  return {
    async markDeleted(id) {
      await db().update(apps).set({ deletedAt: new Date() }).where(eq(apps.id, id));
    },
    async clearDeleted(id) {
      await db().update(apps).set({ deletedAt: null }).where(eq(apps.id, id));
    },
    async liveSerials(id) {
      const rows = await db()
        .select({ serial: releases.serial })
        .from(releases)
        .where(and(eq(releases.appId, id), isNull(releases.deletedAt)));
      return rows.map((row) => row.serial);
    },
    async binRelease(id, serial) {
      await binRelease(username, id, serial);
    },
    async unbinRelease(id, serial) {
      await unbinRelease(username, id, serial);
    },
    async binScreenshots(id) {
      await binScreenshots(username, id);
    },
    async unbinScreenshots(id) {
      await unbinScreenshots(username, id);
    },
  };
}
