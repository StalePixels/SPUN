import Button from "react-bootstrap/Button";
import { adminListCategories, requireAdmin } from "@/lib/admin";
import { formatDay, isoDay } from "@/lib/rules";
import { Breadcrumbs } from "../../Breadcrumbs";
import { deleteAdminCategory, restoreAdminCategory } from "../actions";
import { CategoryForm } from "./CategoryForm";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const rows = await adminListCategories();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Categories" }]} />
      <h1 className="h3 mb-3">Categories</h1>

      <div className="card mb-4" data-testid="category-add">
        <div className="card-header">
          <i className="bi bi-plus-lg me-1" />
          New category
        </div>
        <div className="card-body">
          <CategoryForm />
        </div>
      </div>

      {rows.map((category) => (
        <div key={category.id} className="card mb-4" data-testid={`admin-category-${category.id}`}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className={category.deletedAt ? "text-body-secondary" : "fw-medium"}>
              {category.name} <code className="ms-1">/catalogue/{category.slug}</code>
            </span>
            {category.deletedAt && (
              <span className="text-body-secondary" data-testid="category-deleted">
                Deleted {formatDay(isoDay(category.deletedAt))}
              </span>
            )}
          </div>
          <div className="card-body">
            <CategoryForm category={{ id: category.id, slug: category.slug, name: category.name }} />
            {category.deletedAt ? (
              <form action={restoreAdminCategory.bind(null, category.id)}>
                <Button data-testid="category-restore" type="submit" variant="outline-primary">
                  <i className="bi bi-arrow-counterclockwise me-1" />
                  Restore
                </Button>
              </form>
            ) : (
              <form action={deleteAdminCategory.bind(null, category.id)}>
                <Button data-testid="category-delete" type="submit" variant="outline-danger">
                  <i className="bi bi-trash me-1" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
