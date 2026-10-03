import { notFound } from "next/navigation";
import { parseAppId } from "@/lib/apps";
import { ownReleaseView } from "@/lib/releases";
import { formatDay, parseSerial } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { Breadcrumbs } from "../../../../../Breadcrumbs";
import { ChangelogForm } from "./ChangelogForm";
import { DeleteRelease } from "./DeleteRelease";

export default async function ReleasePage({
  params,
}: {
  params: Promise<{ id: string; serial: string }>;
}) {
  const raw = await params;
  const id = parseAppId(raw.id);
  const serial = parseSerial(raw.serial);
  if (!id || !serial) {
    notFound();
  }
  const user = await requirePublisher();
  const found = await ownReleaseView(user, id, serial);
  if ("error" in found) {
    notFound();
  }
  const release = found.value;
  const label = `Release ${serial}`;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Your apps", href: "/publish" },
          { label: release.appTitle, href: `/publish/apps/${id}` },
          { label },
        ]}
      />
      <h1 className="h3 mb-4">
        {release.appTitle} <span className="text-body-secondary fw-normal">{label}</span>
      </h1>

      {release.deletedDay && (
        <div className="alert alert-secondary" data-testid="release-deleted">
          <i className="bi bi-trash me-1" />
          This release was deleted on {formatDay(release.deletedDay)}.
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3">Version</dt>
            <dd className="col-sm-9" data-testid="release-version">{release.version}</dd>
            <dt className="col-sm-3">Original release date</dt>
            <dd className="col-sm-9" data-testid="release-date">{formatDay(release.releaseDate)}</dd>
            <dt className="col-sm-3">File</dt>
            <dd className="col-sm-9 mb-0" data-testid="release-file">
              <code>{release.path}</code>
            </dd>
          </dl>
        </div>
      </div>

      {release.deletedDay ? null : (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <i className="bi bi-pencil me-1" />
              Changelog
            </div>
            <div className="card-body">
              <ChangelogForm appId={id} serial={serial} changelog={release.changelog ?? ""} />
            </div>
          </div>

          <h2 className="h5">Files in the zip</h2>
          {!release.files ? (
            <p className="text-body-secondary mb-4">The file list is not available.</p>
          ) : release.files.length === 0 ? (
            <p className="text-body-secondary mb-4">The zip has no files.</p>
          ) : (
            <ul className="list-group mb-4">
              {/* A zip can hold the same name twice. */}
              {release.files.map((entry, index) => (
                <li key={index} className="list-group-item" data-testid="zip-entry">
                  <code>{entry}</code>
                </li>
              ))}
            </ul>
          )}

          <div className="card border-danger mb-4">
            <div className="card-header text-danger border-danger">
              <i className="bi bi-exclamation-triangle me-1" />
              Delete release
            </div>
            <div className="card-body">
              <p>Deleting the release removes its file from the server.</p>
              <DeleteRelease appId={id} serial={serial} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
