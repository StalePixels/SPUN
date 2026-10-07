import { notFound } from "next/navigation";
import { adminGetTerms, adminListTerms, requireAdmin } from "@/lib/admin";
import { canChangeTerms, parseTermsId, termsState } from "@/lib/rules";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { saveAdminTerms } from "../../actions";
import { LocalTime } from "../../featured/LocalTime";
import { TermsStateBadge } from "../Badges";
import { TermsForm } from "../TermsForm";
import { DeleteTerms } from "./DeleteTerms";
import { UnpublishTerms } from "./UnpublishTerms";

export default async function TermsVersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = parseTermsId((await params).id);
  const version = id ? await adminGetTerms(id) : undefined;
  if (!version) {
    notFound();
  }
  const { now, currentId } = await adminListTerms();
  const changeable = canChangeTerms(version, now);
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Terms and conditions", href: "/admin/terms" },
          { label: `Version ${version.id}` },
        ]}
      />
      <h1 className="h3 mb-3">Version {version.id}</h1>
      <p className="d-flex align-items-center gap-2">
        <TermsStateBadge state={termsState(version, currentId, now)} />
        {version.publishAt && (
          <span className="text-body-secondary">
            <LocalTime iso={version.publishAt.toISOString()} testId="terms-time" />
          </span>
        )}
      </p>
      {changeable ? (
        <>
          <div className="card mb-4">
            <div className="card-body">
              <TermsForm
                save={saveAdminTerms.bind(null, version.id)}
                text={version.text}
                publishAt={version.publishAt?.toISOString() ?? null}
                published={version.published}
              />
            </div>
          </div>
          <div className="card border-danger mb-4">
            <div className="card-header text-danger border-danger">
              <i className="bi bi-exclamation-triangle me-1" />
              {version.published ? "Unpublish or delete" : "Delete"}
            </div>
            <div className="card-body">
              {version.published && (
                <div className="mb-3">
                  <p>An unpublished version keeps its publish time, so publishing it again puts it back in its place.</p>
                  <UnpublishTerms id={version.id} />
                </div>
              )}
              <DeleteTerms id={version.id} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="alert alert-secondary" data-testid="terms-locked">
            <i className="bi bi-lock me-1" />
            This version is live, so it cannot change: users accepted this text. To change the terms, write a new
            version.
          </div>
          <div className="card mb-4">
            <div className="card-body" data-testid="terms-text" dangerouslySetInnerHTML={{ __html: version.textHtml }} />
          </div>
        </>
      )}
    </>
  );
}
