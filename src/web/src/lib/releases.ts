import "server-only";
import { and, eq, isNull, max } from "drizzle-orm";
import { apps, releases, users } from "@/db/schema";
import type { AppBinStore, AppId } from "./apps";
import { db } from "./db";
import type { Problem } from "./problems";
import { checkChangelog, checkReleaseDate, checkVersion, checkVersionUnused, MAX_UPLOAD_BYTES, SERIAL_MAX } from "./rules";
import { binScreenshots, unbinScreenshots } from "./screenshots";
import { binRelease, releasePath, removeFile, unbinRelease, writeRelease } from "./storage";
import { checkZip } from "./zip";

export type Upload = { version: string; day: string; changelog: string | null; data: Buffer };

export type UploadCheck = { ok: true; upload: Upload } | { ok: false; error: Problem };

export async function checkUpload(
  version: string,
  releaseDate: string,
  changelog: string,
  file: FormDataEntryValue | null,
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
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: "file.missing" } };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: { code: "file.tooLarge" } };
  }
  const data = Buffer.from(await file.arrayBuffer());
  const zip = await checkZip(data);
  if (!zip.ok) {
    return { ok: false, error: zip.error };
  }
  return { ok: true, upload: { version, day: date.day, changelog: log.changelog, data } };
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
