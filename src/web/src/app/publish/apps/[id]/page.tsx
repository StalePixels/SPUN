import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { apps, releases } from "@/db/schema";
import { parseAppId } from "@/lib/apps";
import { appCategoryList, liveCategories } from "@/lib/categories";
import { db } from "@/lib/db";
import { formatDay, isoDay } from "@/lib/rules";
import { appScreenshots } from "@/lib/screenshots";
import { requirePublisher } from "@/lib/session";
import { AppForm } from "../../../AppForm";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { DeleteApp } from "./DeleteApp";
import { ScreenshotSlots } from "./ScreenshotSlots";
import { UploadForm } from "./UploadForm";

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseAppId((await params).id);
  if (!id) {
    notFound();
  }
  const user = await requirePublisher();
  const [app] = await db()
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), eq(apps.userId, user.id), isNull(apps.deletedAt)));
  if (!app) {
    notFound();
  }
  const rows = await db()
    .select()
    .from(releases)
    .where(eq(releases.appId, id))
    .orderBy(desc(releases.serial));
  const categories = await liveCategories();
  const selected = (await appCategoryList(id)).map((category) => category.id);
  const screenshots = await appScreenshots(id);
  return (
    <>
      <Breadcrumbs items={[{ label: "Your apps", href: "/publish" }, { label: app.title }]} />
      <h1 className="h3 mb-4">
        {app.title} <code className="fs-6 ms-1">{app.id}</code>
      </h1>

      <h2 className="h5">Releases</h2>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4">No releases yet.</p>
      ) : (
        <div className="list-group mb-4">
          {rows.map((release) => (
            <Link
              key={release.serial}
              data-testid={`release-${release.serial}`}
              href={`/publish/apps/${app.id}/releases/${release.serial}`}
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${release.deletedAt ? " text-body-secondary" : ""}`}
            >
              <span>
                <span className="fw-medium">Release {release.serial}</span>
                <span className="text-body-secondary ms-2">Version {release.version}</span>
              </span>
              <span className="text-body-secondary">
                {release.deletedAt
                  ? `Deleted ${formatDay(isoDay(release.deletedAt))}`
                  : formatDay(release.releaseDate)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-upload me-1" />
          Upload a release
        </div>
        <div className="card-body">
          <UploadForm appId={app.id} />
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-image me-1" />
          Screenshots
        </div>
        <div className="card-body">
          <ScreenshotSlots appId={app.id} screenshots={screenshots} />
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          Title, description and categories
        </div>
        <div className="card-body">
          <AppForm app={app} categories={categories} selected={selected} />
        </div>
      </div>

      <div className="card border-danger mb-4">
        <div className="card-header text-danger border-danger">
          <i className="bi bi-exclamation-triangle me-1" />
          Delete app
        </div>
        <div className="card-body">
          <p>
            Deleting the app removes its release files. The app id cannot be used again.
          </p>
          <DeleteApp appId={app.id} />
        </div>
      </div>
    </>
  );
}
