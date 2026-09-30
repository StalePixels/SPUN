import Link from "next/link";
import { notFound } from "next/navigation";
import Button from "react-bootstrap/Button";
import { adminGetApp, adminListOwners, adminListReleases, requireAdmin } from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { appCategoryList, liveCategories } from "@/lib/categories";
import { formatDay, isoDay } from "@/lib/rules";
import { appScreenshots } from "@/lib/screenshots";
import { AppForm } from "../../../AppForm";
import { DeleteApp } from "../../../publish/apps/[id]/DeleteApp";
import { ScreenshotSlots } from "../../../publish/apps/[id]/ScreenshotSlots";
import { UploadForm } from "../../../publish/apps/[id]/UploadForm";
import { Breadcrumbs } from "../../../Breadcrumbs";
import {
  clearAdminScreenshot,
  deleteAdminApp,
  restoreAdminApp,
  saveAdminApp,
  uploadAdminRelease,
  uploadAdminScreenshot,
} from "../../actions";
import { MoveApp } from "./MoveApp";

export default async function AdminAppPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = parseAppId((await params).id);
  if (!id) {
    notFound();
  }
  const app = await adminGetApp(id);
  if (!app) {
    notFound();
  }
  const rows = await adminListReleases(id);
  const owners = await adminListOwners();
  const categories = await liveCategories();
  const selected = (await appCategoryList(id)).map((category) => category.id);
  const screenshots = await appScreenshots(id);
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Apps", href: "/admin/apps" },
          { label: app.title },
        ]}
      />
      <h1 className="h3 mb-4">
        {app.title} <code className="fs-6 ms-1">{app.id}</code>
      </h1>

      {app.deletedAt && (
        <div className="alert alert-secondary" data-testid="admin-app-deleted-note">
          <i className="bi bi-trash me-1" />
          This app was deleted on {formatDay(isoDay(app.deletedAt))}.
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3">Owner</dt>
            <dd className="col-sm-9 mb-0">
              <Link href={`/admin/users/${app.ownerId}`} data-testid="admin-app-owner">
                {app.owner}
              </Link>
            </dd>
          </dl>
        </div>
      </div>

      <h2 className="h5">Releases</h2>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4">No releases yet.</p>
      ) : (
        <div className="list-group mb-4">
          {rows.map((release) => (
            <Link
              key={release.serial}
              data-testid={`release-${release.serial}`}
              href={`/admin/apps/${app.id}/releases/${release.serial}`}
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

      {!app.deletedAt && (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-upload me-1" />
            Upload a release
          </div>
          <div className="card-body">
            <UploadForm appId={app.id} upload={uploadAdminRelease.bind(null, app.id)} />
          </div>
        </div>
      )}

      {!app.deletedAt && (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-image me-1" />
            Screenshots
          </div>
          <div className="card-body">
            <ScreenshotSlots
              appId={app.id}
              screenshots={screenshots}
              upload={(slot) => uploadAdminScreenshot.bind(null, app.id, slot)}
              clear={(slot) => clearAdminScreenshot.bind(null, app.id, slot)}
            />
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          Title, description and categories
        </div>
        <div className="card-body">
          <AppForm
            app={{ id: app.id, title: app.title, description: app.description }}
            categories={categories}
            selected={selected}
            save={saveAdminApp.bind(null, app.id)}
          />
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-arrow-left-right me-1" />
          Move to another user
        </div>
        <div className="card-body">
          <MoveApp appId={app.id} ownerId={app.ownerId} users={owners} />
        </div>
      </div>

      {app.deletedAt ? (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-arrow-counterclockwise me-1" />
            Restore app
          </div>
          <div className="card-body">
            <p>Restoring the app puts back the files of its releases that are not deleted.</p>
            <form action={restoreAdminApp.bind(null, app.id)}>
              <Button data-testid="restore-app" type="submit" variant="outline-primary">
                <i className="bi bi-arrow-counterclockwise me-1" />
                Restore app
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card border-danger mb-4">
          <div className="card-header text-danger border-danger">
            <i className="bi bi-exclamation-triangle me-1" />
            Delete app
          </div>
          <div className="card-body">
            <p>Deleting the app moves its release files to the recycle bin.</p>
            <DeleteApp appId={app.id} remove={deleteAdminApp} />
          </div>
        </div>
      )}
    </>
  );
}
