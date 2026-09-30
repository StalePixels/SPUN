import { notFound } from "next/navigation";
import Button from "react-bootstrap/Button";
import { adminGetApp, adminGetRelease, requireAdmin } from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { formatDay, isoDay, parseSerial, releaseFileName } from "@/lib/rules";
import { DeleteRelease } from "../../../../../publish/apps/[id]/releases/[serial]/DeleteRelease";
import { Breadcrumbs } from "../../../../../Breadcrumbs";
import { deleteAdminRelease, restoreAdminRelease } from "../../../../actions";
import { ReleaseForm } from "./ReleaseForm";

export default async function AdminReleasePage({
  params,
}: {
  params: Promise<{ id: string; serial: string }>;
}) {
  await requireAdmin();
  const raw = await params;
  const id = parseAppId(raw.id);
  const serial = parseSerial(raw.serial);
  if (!id || !serial) {
    notFound();
  }
  const app = await adminGetApp(id);
  const release = await adminGetRelease(id, serial);
  if (!app || !release) {
    notFound();
  }
  const label = `Release ${serial}`;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Apps", href: "/admin/apps" },
          { label: app.title, href: `/admin/apps/${app.id}` },
          { label },
        ]}
      />
      <h1 className="h3 mb-4">
        {app.title} <span className="text-body-secondary fw-normal">{label}</span>
      </h1>

      {release.deletedAt && (
        <div className="alert alert-secondary" data-testid="release-deleted">
          <i className="bi bi-trash me-1" />
          This release was deleted on {formatDay(isoDay(release.deletedAt))}.
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3">File</dt>
            <dd className="col-sm-9 mb-0" data-testid="release-file">
              <code>
                /{app.owner}/{releaseFileName(app.id, serial)}
              </code>
            </dd>
          </dl>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          Version, date and changelog
        </div>
        <div className="card-body">
          <ReleaseForm
            appId={app.id}
            serial={serial}
            version={release.version}
            releaseDate={release.releaseDate}
            changelog={release.changelog ?? ""}
          />
        </div>
      </div>

      {release.deletedAt ? (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-arrow-counterclockwise me-1" />
            Restore release
          </div>
          <div className="card-body">
            <form action={restoreAdminRelease.bind(null, app.id, serial)}>
              <Button data-testid="restore-release" type="submit" variant="outline-primary">
                <i className="bi bi-arrow-counterclockwise me-1" />
                Restore release
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card border-danger mb-4">
          <div className="card-header text-danger border-danger">
            <i className="bi bi-exclamation-triangle me-1" />
            Delete release
          </div>
          <div className="card-body">
            <p>Deleting the release moves its file to the recycle bin.</p>
            <DeleteRelease appId={app.id} serial={serial} remove={deleteAdminRelease} />
          </div>
        </div>
      )}
    </>
  );
}
