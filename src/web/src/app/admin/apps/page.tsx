import Table from "react-bootstrap/Table";
import { formatDay, isoDay } from "@/lib/rules";
import { adminListApps, requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../../Breadcrumbs";

export default async function AdminAppsPage() {
  await requireAdmin();
  const rows = await adminListApps();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Apps" }]} />
      <h1 className="h3 mb-3">Apps</h1>
      <Table responsive className="mb-4">
        <thead>
          <tr>
            <th>Title</th>
            <th>App id</th>
            <th>Owner</th>
            <th className="text-end">Releases</th>
            <th>Deleted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((app) => (
            <tr key={app.id} data-testid={`admin-app-${app.id}`} className={app.deletedAt ? "text-body-secondary" : undefined}>
              <td>{app.title}</td>
              <td>
                <code>{app.id}</code>
              </td>
              <td>{app.owner}</td>
              <td className="text-end">{app.releaseCount}</td>
              <td data-testid="admin-app-deleted">
                {app.deletedAt ? formatDay(isoDay(app.deletedAt)) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
