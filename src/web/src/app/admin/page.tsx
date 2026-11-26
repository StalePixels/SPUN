import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../Breadcrumbs";

const SECTIONS = [
  { href: "/admin/settings", icon: "bi-sliders", label: "Settings" },
  { href: "/admin/users", icon: "bi-people", label: "Users" },
  { href: "/admin/apps", icon: "bi-box-seam", label: "Apps" },
  { href: "/admin/categories", icon: "bi-tags", label: "Categories" },
  { href: "/admin/featured", icon: "bi-star", label: "Featured" },
  { href: "/admin/terms", icon: "bi-file-earmark-text", label: "Terms and conditions" },
  { href: "/admin/clients", icon: "bi-graph-up", label: "Client statistics" },
];

export default async function AdminPage() {
  await requireAdmin();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin" }]} />
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-gear me-1" />
          Sections
        </div>
        <div className="list-group list-group-flush">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              data-testid={`admin-link-${section.href.split("/").pop()}`}
              href={section.href}
              className="list-group-item list-group-item-action"
            >
              <i className={`bi ${section.icon} me-2`} />
              {section.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
