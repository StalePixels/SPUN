import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFeatureApp, adminLastArticle, adminSearchApps, requireAdmin } from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { parseQuery } from "@/lib/rules";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { createAdminFeature } from "../../actions";
import { AppState } from "../Badges";
import { FeatureForm } from "../FeatureForm";

export default async function NewFeaturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  if (params.app !== undefined) {
    const appId = parseAppId(parseQuery(params.app));
    const app = appId ? await adminFeatureApp(appId) : undefined;
    if (!app) {
      notFound();
    }
    return (
      <>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Featured", href: "/admin/featured" },
            { label: "New feature", href: "/admin/featured/new" },
            { label: app.title },
          ]}
        />
        <h1 className="h3 mb-3">
          {app.title} <code className="fs-6 ms-1">{app.id}</code> <AppState appPublic={app.appPublic} />
        </h1>
        <div className="card mb-4">
          <div className="card-body">
            <FeatureForm
              save={createAdminFeature.bind(null, app.id)}
              article={(await adminLastArticle(app.id)) ?? ""}
              publishAt={null}
              published={false}
            />
          </div>
        </div>
      </>
    );
  }
  const query = parseQuery(params.q);
  const results = query === "" ? [] : await adminSearchApps(query);
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Featured", href: "/admin/featured" },
          { label: "New feature" },
        ]}
      />
      <h1 className="h3 mb-3">New feature</h1>
      <form action="/admin/featured/new" method="get" role="search" className="d-flex gap-2 mb-3" data-testid="featured-search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          className="form-control"
          aria-label="Search apps"
          placeholder="Title or description"
          data-testid="featured-search-input"
        />
        <button type="submit" className="btn btn-primary" data-testid="featured-search-submit">
          <i className="bi bi-search me-1" />
          Search
        </button>
      </form>
      {query !== "" && results.length === 0 && (
        <p className="text-body-secondary" data-testid="featured-search-none">
          No app matches.
        </p>
      )}
      {results.length > 0 && (
        <div className="list-group mb-4" data-testid="featured-search-results">
          {results.map((app) => (
            <div
              key={app.id}
              data-testid={`featured-app-${app.id}`}
              className="list-group-item d-flex justify-content-between align-items-center gap-2"
            >
              <span>
                <span className="fw-medium">{app.title}</span> <code className="ms-1">{app.id}</code>
                <span className="text-body-secondary ms-2">{app.owner}</span>
              </span>
              <span className="d-flex align-items-center gap-2">
                <AppState appPublic={app.appPublic} />
                <Link
                  href={`/admin/featured/new?app=${app.id}`}
                  className="btn btn-sm btn-outline-primary"
                  data-testid="featured-app-feature"
                >
                  Feature
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
