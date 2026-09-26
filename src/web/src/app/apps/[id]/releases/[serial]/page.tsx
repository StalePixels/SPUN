import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { apps, releases } from "@/db/schema";
import { parseAppId } from "@/lib/apps";
import { db } from "@/lib/db";
import { formatDay, isoDay, parseSerial, releaseFileName } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { readRelease, releasePath } from "@/lib/storage";
import { checkZip } from "@/lib/zip";
import { Breadcrumbs } from "../../../../Breadcrumbs";
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
  const [app] = await db()
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), eq(apps.userId, user.id), isNull(apps.deletedAt)));
  if (!app) {
    notFound();
  }
  const [release] = await db()
    .select()
    .from(releases)
    .where(and(eq(releases.appId, id), eq(releases.serial, serial)));
  if (!release) {
    notFound();
  }
  const deleted = release.deletedAt !== null;
  const data = deleted ? null : await readRelease(releasePath(user.username, id, serial));
  const zip = data ? await checkZip(data) : null;
  const label = `Release ${serial}`;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Your apps", href: "/" },
          { label: app.title, href: `/apps/${app.id}` },
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
            <dt className="col-sm-3">Version</dt>
            <dd className="col-sm-9" data-testid="release-version">{release.version}</dd>
            <dt className="col-sm-3">Original release date</dt>
            <dd className="col-sm-9" data-testid="release-date">{formatDay(release.releaseDate)}</dd>
            <dt className="col-sm-3">File</dt>
            <dd className="col-sm-9 mb-0" data-testid="release-file">
              <code>
                /{user.username}/{releaseFileName(app.id, serial)}
              </code>
            </dd>
          </dl>
        </div>
      </div>

      {deleted ? null : (
        <>
          <h2 className="h5">Files in the zip</h2>
          {!zip?.ok ? (
            <p className="text-body-secondary mb-4">The file list is not available.</p>
          ) : zip.entries.length === 0 ? (
            <p className="text-body-secondary mb-4">The zip has no files.</p>
          ) : (
            <ul className="list-group mb-4">
              {/* A zip can hold the same name twice. */}
              {zip.entries.map((entry, index) => (
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
              <DeleteRelease appId={app.id} serial={serial} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
