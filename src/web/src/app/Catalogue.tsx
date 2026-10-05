import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogueView, type CatalogueRow } from "@/lib/catalogue";
import { catalogueHref, formatDay } from "@/lib/rules";
import { savedIds } from "@/lib/saved";
import { currentUser } from "@/lib/session";
import { SaveButton } from "./SaveButton";
import { SectionMenu } from "./SectionMenu";
import { Screenshot } from "./Screenshot";

// The same page for / (slug null) and for each category URL.
export async function Catalogue({ slug, page, query }: { slug: string | null; page: number; query: string }) {
  const view = await catalogueView(slug, page, query);
  if (!view) {
    notFound();
  }
  const { category, categories, rows, more } = view;
  const base = category ? `/catalogue/${category.slug}` : "/catalogue";
  const markdown = catalogueHref(`${base}.md`, query, page);
  return (
    <>
      <link rel="alternate" type="text/markdown" href={markdown} />
      <h1 className="h3 mb-3" data-testid="catalogue-heading">{category?.name ?? "Apps"}</h1>
      <form action={base} method="get" role="search" className="d-flex gap-2 mb-3" data-testid="catalogue-search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          className="form-control"
          aria-label="Search"
          placeholder="e.g. tetris"
          data-testid="catalogue-search-input"
        />
        <button type="submit" className="btn btn-primary" data-testid="catalogue-search-submit">
          <i className="bi bi-search me-1" />
          Search
        </button>
      </form>
      {categories.length > 0 && (
        <SectionMenu
          id="category-links"
          item="category-link"
          label="Categories"
          className="mb-3"
          sections={[
            { href: "/catalogue", key: "", label: "All", testId: "category-all" },
            ...categories.map((item) => ({ href: `/catalogue/${item.slug}`, key: item.slug, label: item.name })),
          ]}
          active={category?.slug ?? ""}
        />
      )}
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="catalogue-empty">
          No apps to show.
        </p>
      ) : (
        <CatalogueRows rows={rows} />
      )}
      {(page > 1 || more) && (
        <nav className="d-flex justify-content-between mb-4" aria-label="Pages">
          {page > 1 ? (
            <Link
              href={catalogueHref(base, query, page - 1)}
              className="btn btn-outline-primary"
              data-testid="catalogue-previous"
            >
              <i className="bi bi-chevron-left me-1" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {more && (
            <Link href={catalogueHref(base, query, page + 1)} className="btn btn-outline-primary" data-testid="catalogue-next">
              Next
              <i className="bi bi-chevron-right ms-1" />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

// Also the rows of /my. The Save button is only for a logged-in user.
export async function CatalogueRows({ rows }: { rows: CatalogueRow[] }) {
  const user = await currentUser();
  const saved = user ? await savedIds(user.id, rows.map((app) => app.id)) : null;
  return (
    <div className="list-group mb-4">
      {rows.map((app) => (
        <div key={app.id} className="list-group-item list-group-item-action d-flex align-items-center gap-3">
          <Link
            data-testid={`catalogue-app-${app.id}`}
            href={`/catalogue/${app.id}`}
            className="d-flex flex-grow-1 align-items-center gap-3 text-reset text-decoration-none"
          >
            <span className="flex-shrink-0" style={{ width: 64 }}>
              {app.screenshot ? (
                <Screenshot
                  url={app.screenshot.url}
                  width={app.screenshot.width}
                  alt=""
                  testId="catalogue-screenshot"
                  className="d-block"
                />
              ) : (
                <Screenshot url="/placeholder.png" width={320} alt="" testId="catalogue-placeholder" className="d-block" />
              )}
            </span>
            <span className="flex-grow-1">
              <span className="fw-medium" data-testid="catalogue-title">{app.title}</span>
              <span className="text-body-secondary ms-2" data-testid="catalogue-publisher">{app.username}</span>
              {app.categories.map((item) => (
                <span
                  key={item.id}
                  className="badge text-bg-secondary ms-2"
                  data-testid={`catalogue-category-${item.slug}`}
                >
                  {item.name}
                </span>
              ))}
            </span>
            <span className="text-body-secondary">
              <span data-testid="catalogue-version">{app.version}</span>
              <span className="ms-2" data-testid="catalogue-date">{formatDay(app.releaseDate)}</span>
              <span className="ms-2" title="Downloads">
                <i className="bi bi-download me-1" aria-hidden="true" />
                <span data-testid="catalogue-downloads">{app.downloads}</span>
              </span>
            </span>
          </Link>
          {saved && <SaveButton appId={app.id} saved={saved.has(app.id)} />}
        </div>
      ))}
    </div>
  );
}
