import Link from "next/link";
import { notFound } from "next/navigation";
import { appView } from "@/lib/catalogue";
import { formatDay } from "@/lib/rules";
import { savedIds } from "@/lib/saved";
import { currentUser, requireRegistration } from "@/lib/session";
import { Breadcrumbs } from "../../Breadcrumbs";
import { SaveButton } from "../../SaveButton";
import { Screenshot } from "../../Screenshot";

export default async function PublicAppPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRegistration();
  const view = await appView((await params).id);
  if (!view) {
    notFound();
  }
  const { app, releases: rows, categories, screenshots } = view;
  const main = screenshots.find((shot) => shot.slot === 1);
  const others = screenshots.filter((shot) => shot.slot !== 1);
  const latest = rows[0];
  const user = await currentUser();
  const saved = user ? (await savedIds(user.id, [app.id])).has(app.id) : null;
  return (
    <>
      <link rel="alternate" type="text/markdown" href={`/apps/${app.id}.md`} />
      <Breadcrumbs items={[{ label: "Apps", href: "/" }, { label: app.title }]} />
      <h1 className="h3 mb-1" data-testid="public-app-title">{app.title}</h1>
      <p className="text-body-secondary mb-2" data-testid="public-app-publisher">{app.username}</p>
      <p className="mb-4" data-testid="public-app-categories">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/${category.slug}`}
            className="badge text-bg-secondary text-decoration-none me-2"
            data-testid={`public-app-category-${category.slug}`}
          >
            {category.name}
          </Link>
        ))}
      </p>

      {app.description && (
        <p className="mb-4" data-testid="public-app-description">{app.description}</p>
      )}

      {screenshots.length > 0 && (
        <div className="d-flex flex-wrap align-items-start gap-3 mb-4" data-testid="public-screenshots">
          {main && (
            <Screenshot
              url={main.url}
              width={main.width}
              scale={2}
              alt={`${app.title}, main screenshot`}
              testId="public-screenshot-1"
            />
          )}
          {others.length > 0 && (
            <div className="d-flex flex-column gap-3">
              {others.map((shot) => (
                <Screenshot
                  key={shot.slot}
                  url={shot.url}
                  width={shot.width}
                  alt={`${app.title}, screenshot ${shot.slot}`}
                  testId={`public-screenshot-${shot.slot}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
          <dl className="row mb-0 flex-grow-1">
            <dt className="col-sm-4">Latest version</dt>
            <dd className="col-sm-8" data-testid="public-app-version">{latest.version}</dd>
            <dt className="col-sm-4">Release date</dt>
            <dd className="col-sm-8" data-testid="public-app-date">{formatDay(latest.releaseDate)}</dd>
            <dt className="col-sm-4">Downloads</dt>
            <dd className="col-sm-8 mb-0" data-testid="public-app-downloads">{app.downloads}</dd>
          </dl>
          <div className="d-flex align-items-center gap-2">
            {saved !== null && <SaveButton appId={app.id} saved={saved} />}
            <a href={`/apps/${app.id}/download`} className="btn btn-primary" data-testid="public-app-download" download>
              <i className="bi bi-download me-1" />
              Download
            </a>
          </div>
        </div>
      </div>

      <h2 className="h5">Releases</h2>
      <ul className="list-group mb-4">
        {rows.map((release) => (
          <li key={release.serial} data-testid={`public-release-${release.serial}`} className="list-group-item">
            <div className="d-flex justify-content-between align-items-center">
              <span className="fw-medium">Version {release.version}</span>
              <span className="text-body-secondary">{formatDay(release.releaseDate)}</span>
            </div>
            {release.changelog && (
              <div
                className="mt-2 small"
                style={{ whiteSpace: "pre-wrap" }}
                data-testid={`public-changelog-${release.serial}`}
              >
                {release.changelog}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
