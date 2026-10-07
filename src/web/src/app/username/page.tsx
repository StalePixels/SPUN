import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { currentTerms } from "@/lib/terms";
import { UsernameForm } from "./UsernameForm";

export default async function UsernamePage() {
  const user = await requireUser();
  if (user.username) {
    redirect("/");
  }
  const terms = await currentTerms();
  return (
    <>
      <h1 className="h3">Choose your username</h1>
      <p>
        Your username is part of the path to your files. You cannot change it
        later.
      </p>
      {terms && (
        <div className="card mb-4" data-testid="username-terms" data-terms-id={terms.id}>
          <div className="card-header">
            <i className="bi bi-file-earmark-text me-1" />
            Terms and conditions
          </div>
          <div
            className="card-body overflow-auto"
            style={{ maxHeight: "24rem" }}
            data-testid="terms-text"
            dangerouslySetInnerHTML={{ __html: terms.textHtml }}
          />
        </div>
      )}
      <UsernameForm termsId={terms?.id ?? null} />
    </>
  );
}
