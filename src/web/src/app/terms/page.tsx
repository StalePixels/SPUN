import { mustAcceptTerms } from "@/lib/rules";
import { currentUser } from "@/lib/session";
import { currentTerms } from "@/lib/terms";
import { AcceptTerms } from "./AcceptTerms";

// Public. A user with no username accepts on /username instead.
export default async function TermsPage() {
  const terms = await currentTerms();
  const user = await currentUser();
  const mustAccept = Boolean(terms && user?.username && mustAcceptTerms(user.acceptedTermsId, terms.id));
  return (
    <>
      <h1 className="h3 mb-3">Terms and conditions</h1>
      {terms ? (
        <>
          {mustAccept && (
            <div className="alert alert-info" data-testid="terms-must-accept">
              <i className="bi bi-info-circle me-1" />
              Read the terms and conditions, then accept them to continue.
            </div>
          )}
          <div className="card mb-4" data-testid="terms" data-terms-id={terms.id}>
            <div className="card-body" data-testid="terms-text" dangerouslySetInnerHTML={{ __html: terms.textHtml }} />
          </div>
          {mustAccept && <AcceptTerms termsId={terms.id} />}
        </>
      ) : (
        <p className="text-body-secondary" data-testid="terms-none">
          The terms and conditions are not available.
        </p>
      )}
    </>
  );
}
