import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { apps, releases, users } from "@/db/schema";
import { checkAppFields, type AppId } from "./apps";
import { appCategoryList } from "./categories";
import { db } from "./db";
import type { Problem } from "./problems";
import { appDotOverrides, checkUpload } from "./releases";
import { releaseFileName } from "./rules";
import { readRelease, releasePath } from "./storage";

export type ReleaseRevalidation = { serial: number; version: string; error: Problem | null };

export type AppRevalidation = { app: Problem | null; releases: ReleaseRevalidation[] };

export async function revalidateApp(appId: AppId): Promise<AppRevalidation | null> {
  const [app] = await db()
    .select({ title: apps.title, description: apps.description, installDir: apps.installDir, owner: users.username })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(and(eq(apps.id, appId), isNull(apps.deletedAt)));
  if (!app || !app.owner) {
    return null;
  }
  const fields = await checkAppFields({
    title: app.title,
    description: app.description,
    installDir: app.installDir ?? "",
    categories: (await appCategoryList(appId)).map((category) => category.id),
  });
  const overrides = await appDotOverrides(appId);
  const rows = await db()
    .select()
    .from(releases)
    .where(and(eq(releases.appId, appId), isNull(releases.deletedAt)))
    .orderBy(asc(releases.serial));
  const results: ReleaseRevalidation[] = [];
  for (const release of rows) {
    const data = await readRelease(releasePath(app.owner, appId, release.serial));
    const checked = await checkUpload(
      release.version,
      release.releaseDate,
      release.changelog ?? "",
      data ? { name: releaseFileName(appId, release.serial), data } : null,
      overrides,
    );
    results.push({ serial: release.serial, version: release.version, error: checked.ok ? null : checked.error });
  }
  return { app: fields.ok ? null : fields.error, releases: results };
}
