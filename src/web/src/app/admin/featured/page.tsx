import Link from "next/link";
import { adminListFeatures, requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../../Breadcrumbs";
import { AppState, FeatureStateBadge, featureState } from "./Badges";
import { LocalTime } from "./LocalTime";

export default async function AdminFeaturedPage() {
  await requireAdmin();
  const { rows, liveId } = await adminListFeatures();
  const now = new Date();
  const live = rows.find((row) => row.id === liveId);
  const drafts = rows.filter((row) => row.publishAt === null);
  const timeline = rows.flatMap((row) => (row.publishAt ? [{ ...row, publishAt: row.publishAt }] : []));
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Featured" }]} />
      <h1 className="h3 mb-3">Featured</h1>

      <div className="card mb-4" data-testid="featured-live">
        <div className="card-header">
          <i className="bi bi-broadcast me-1" />
          Live feature
        </div>
        <div className="card-body">
          {live ? (
            <>
              <h2 className="h5" data-testid="featured-live-title">
                <Link href={`/admin/featured/${live.id}`}>{live.title}</Link>
              </h2>
              <div data-testid="featured-live-article" dangerouslySetInnerHTML={{ __html: live.articleHtml }} />
            </>
          ) : (
            <p className="text-body-secondary mb-0" data-testid="featured-live-none">
              No feature is live. The home page has no feature.
            </p>
          )}
        </div>
      </div>

      <p>
        <Link href="/admin/featured/new" className="btn btn-primary" data-testid="featured-new">
          <i className="bi bi-plus-lg me-1" />
          New feature
        </Link>
      </p>

      <h2 className="h5">Drafts</h2>
      {drafts.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="featured-drafts-none">
          No drafts.
        </p>
      ) : (
        <div className="list-group mb-4" data-testid="featured-drafts">
          {drafts.map((row) => (
            <Link
              key={row.id}
              data-testid={`feature-${row.id}`}
              href={`/admin/featured/${row.id}`}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            >
              <span className="fw-medium">{row.title}</span>
              <AppState appPublic={row.appPublic} />
            </Link>
          ))}
        </div>
      )}

      <h2 className="h5">Timeline</h2>
      {timeline.length === 0 ? (
        <p className="text-body-secondary mb-4">No features have a publish time.</p>
      ) : (
        <div className="list-group mb-4" data-testid="featured-timeline">
          {timeline.map((row) => (
            <Link
              key={row.id}
              data-testid={`feature-${row.id}`}
              href={`/admin/featured/${row.id}`}
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${row.id === liveId ? " list-group-item-success" : ""}`}
            >
              <span>
                <span className="fw-medium">{row.title}</span>
                <span className="text-body-secondary ms-2">
                  <LocalTime iso={row.publishAt.toISOString()} testId="feature-time" />
                </span>
              </span>
              <FeatureStateBadge state={featureState(row, liveId, now)} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
