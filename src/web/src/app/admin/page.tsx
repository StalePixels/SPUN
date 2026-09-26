import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../Breadcrumbs";

const SECTIONS = [
  { href: "/admin/settings", icon: "bi-sliders", label: "Settings" },
  { href: "/admin/users", icon: "bi-people", label: "Users" },
  { href: "/admin/apps", icon: "bi-box-seam", label: "Apps" },
];

export default async function AdminPage() {
  await requireAdmin();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin" }]} />
      <h1 className="h3 mb-3">Admin</h1>
      <div className="list-group mb-4">
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
    </>
  );
}
