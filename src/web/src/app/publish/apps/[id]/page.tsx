import Link from "next/link";
import { notFound } from "next/navigation";
import { ownAppView, parseAppId } from "@/lib/apps";
import { liveCategories } from "@/lib/categories";
import { formatDay } from "@/lib/rules";
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
  const app = await ownAppView(user.id, id);
  if (!app) {
    notFound();
  }
  const categories = await liveCategories();
  return (
    <>
      <Breadcrumbs items={[{ label: "Your apps", href: "/publish" }, { label: app.title }]} />
      <h1 className="h3 mb-4">
        {app.title} <code className="fs-6 ms-1">{app.id}</code>
      </h1>

      <h2 className="h5">Releases</h2>
      {app.releases.length === 0 ? (
        <p className="text-body-secondary mb-4">No releases yet.</p>
      ) : (
        <div className="list-group mb-4">
          {app.releases.map((release) => (
            <Link
              key={release.serial}
              data-testid={`release-${release.serial}`}
              href={`/publish/apps/${app.id}/releases/${release.serial}`}
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${release.deletedDay ? " text-body-secondary" : ""}`}
            >
              <span>
                <span className="fw-medium">Release {release.serial}</span>
                <span className="text-body-secondary ms-2">Version {release.version}</span>
              </span>
              <span className="text-body-secondary">
                {release.deletedDay
                  ? `Deleted ${formatDay(release.deletedDay)}`
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
          <ScreenshotSlots appId={app.id} screenshots={app.screenshots} />
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          Title, description, install directory and categories
        </div>
        <div className="card-body">
          <AppForm app={app} categories={categories} selected={app.categories} />
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
