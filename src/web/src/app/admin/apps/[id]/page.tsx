import Link from "next/link";
import { adminListReleases } from "@/lib/admin";
import { uploadLimit } from "@/lib/limits";
import { formatDay, isoDay } from "@/lib/rules";
import { UploadForm } from "../../../publish/apps/[id]/UploadForm";
import { uploadAdminRelease } from "../../actions";
import { AdminAppTabs, loadAdminApp } from "./AdminAppTabs";
import { Revalidate } from "./Revalidate";

export default async function AdminAppPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  const rows = await adminListReleases(app.id);
  return (
    <>
      <AdminAppTabs app={app} active="releases" />

      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-list-ul me-1" />
          App releases
        </div>
        {rows.length === 0 ? (
          <div className="card-body">
            <p className="text-body-secondary mb-0">No releases yet.</p>
          </div>
        ) : (
          <div className="list-group list-group-flush">
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
      </div>

      {!app.deletedAt && (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-upload me-1" />
            Upload a release
          </div>
          <div className="card-body">
            <UploadForm appId={app.id} maxBytes={await uploadLimit(app.ownerId)} upload={uploadAdminRelease.bind(null, app.id)} />
          </div>
        </div>
      )}

      {!app.deletedAt && (
        <div className="card mb-4" data-testid="revalidate">
          <div className="card-header">
            <i className="bi bi-check2-all me-1" />
            Revalidate
          </div>
          <div className="card-body">
            <Revalidate appId={app.id} />
          </div>
        </div>
      )}
    </>
  );
}
