import Link from "next/link";
import { notFound } from "next/navigation";
import { adminGetApp, requireAdmin } from "@/lib/admin";
import { parseAppId } from "@/lib/apps";
import { formatDay, isoDay } from "@/lib/rules";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { SectionMenu } from "../../../SectionMenu";

export type AdminAppTab = "releases" | "depends" | "screenshots" | "details" | "names" | "owner" | "delete";

export type AdminApp = NonNullable<Awaited<ReturnType<typeof adminGetApp>>>;

export async function loadAdminApp(params: Promise<{ id: string }>): Promise<AdminApp> {
  await requireAdmin();
  const id = parseAppId((await params).id);
  if (!id) {
    notFound();
  }
  const app = await adminGetApp(id);
  if (!app) {
    notFound();
  }
  return app;
}

export function AdminAppTabs({ app, active }: { app: AdminApp; active: AdminAppTab }) {
  const base = `/admin/apps/${app.id}`;
  const sections = [
    { href: base, key: "releases", label: "Releases" },
    { href: `${base}/depends`, key: "depends", label: "Dependencies" },
    ...(app.deletedAt ? [] : [{ href: `${base}/screenshots`, key: "screenshots", label: "Screenshots" }]),
    { href: `${base}/details`, key: "details", label: "Details" },
    { href: `${base}/names`, key: "names", label: "Names" },
    { href: `${base}/owner`, key: "owner", label: "Owner" },
    { href: `${base}/delete`, key: "delete", label: app.deletedAt ? "Restore" : "Delete" },
  ];
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Apps", href: "/admin/apps" },
          { label: app.title },
        ]}
      />
      <h1 className="h3 mb-2">
        {app.title} <code className="fs-6 ms-1">{app.id}</code>
      </h1>
      <p className="text-body-secondary mb-4">
        <i className="bi bi-person me-1" />
        Owner{" "}
        <Link href={`/admin/users/${app.ownerId}`} data-testid="admin-app-owner">
          {app.owner}
        </Link>
      </p>

      {app.deletedAt && (
        <div className="alert alert-secondary" data-testid="admin-app-deleted-note">
          <i className="bi bi-trash me-1" />
          This app was deleted on {formatDay(isoDay(app.deletedAt))}.
        </div>
      )}

      <SectionMenu id="admin-app-tabs" item="admin-app-tab" label="App" active={active} sections={sections} />
    </>
  );
}
