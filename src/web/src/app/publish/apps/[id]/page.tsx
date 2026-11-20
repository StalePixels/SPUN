import Link from "next/link";
import { formatDay } from "@/lib/rules";
import { AppTabs, loadOwnApp } from "./AppTabs";
import { RepublishForm } from "./RepublishForm";
import { UploadForm } from "./UploadForm";

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { app } = await loadOwnApp(params);
  const latest = app.releases.find((release) => !release.deletedDay);
  return (
    <>
      <AppTabs app={app} active="releases" />

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

      {latest && (
        <div className="card mb-4" data-testid="republish">
          <div className="card-header">
            <i className="bi bi-arrow-repeat me-1" />
            Republish
          </div>
          <div className="card-body">
            <RepublishForm appId={app.id} version={latest.version} />
          </div>
        </div>
      )}
    </>
  );
}
