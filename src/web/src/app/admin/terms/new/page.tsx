import { adminListTerms, requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { createAdminTerms } from "../../actions";
import { TermsForm } from "../TermsForm";

// A change is a new version, so the editor starts from the current text.
export default async function NewTermsPage() {
  await requireAdmin();
  const { rows, currentId } = await adminListTerms();
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Terms and conditions", href: "/admin/terms" },
          { label: "New version" },
        ]}
      />
      <h1 className="h3 mb-3">New version</h1>
      <div className="card mb-4">
        <div className="card-body">
          <TermsForm
            save={createAdminTerms}
            text={rows.find((row) => row.id === currentId)?.text ?? ""}
            publishAt={null}
            published={false}
          />
        </div>
      </div>
    </>
  );
}
