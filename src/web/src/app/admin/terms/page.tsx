import Link from "next/link";
import { adminListTerms, requireAdmin } from "@/lib/admin";
import { termsState } from "@/lib/rules";
import { Breadcrumbs } from "../../Breadcrumbs";
import { LocalTime } from "../featured/LocalTime";
import { TermsStateBadge } from "./Badges";

export default async function AdminTermsPage() {
  await requireAdmin();
  const { rows, now, currentId } = await adminListTerms();
  const current = rows.find((row) => row.id === currentId);
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Terms and conditions" }]} />
      <h1 className="h3 mb-3">Terms and conditions</h1>

      <div className="card mb-4" data-testid="terms-current">
        <div className="card-header">
          <i className="bi bi-broadcast me-1" />
          Current version
        </div>
        <div className="card-body">
          {current ? (
            <>
              <h2 className="h5" data-testid="terms-current-title">
                <Link href={`/admin/terms/${current.id}`}>Version {current.id}</Link>
              </h2>
              <div data-testid="terms-current-text" dangerouslySetInnerHTML={{ __html: current.textHtml }} />
            </>
          ) : (
            <p className="text-body-secondary mb-0" data-testid="terms-current-none">
              No version is live. Publish one.
            </p>
          )}
        </div>
      </div>

      <p>
        <Link href="/admin/terms/new" className="btn btn-primary" data-testid="terms-new">
          <i className="bi bi-plus-lg me-1" />
          New version
        </Link>
      </p>

      <h2 className="h5">Versions</h2>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="terms-versions-none">
          No versions.
        </p>
      ) : (
        <div className="list-group mb-4" data-testid="terms-versions">
          {rows.map((row) => (
            <Link
              key={row.id}
              data-testid={`terms-${row.id}`}
              href={`/admin/terms/${row.id}`}
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${row.id === currentId ? " list-group-item-success" : ""}`}
            >
              <span>
                <span className="fw-medium">Version {row.id}</span>
                {row.publishAt && (
                  <span className="text-body-secondary ms-2">
                    <LocalTime iso={row.publishAt.toISOString()} testId="terms-time" />
                  </span>
                )}
              </span>
              <TermsStateBadge state={termsState(row, currentId, now)} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
