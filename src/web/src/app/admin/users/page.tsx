import Link from "next/link";
import Table from "react-bootstrap/Table";
import { formatDay, isoDay } from "@/lib/rules";
import { adminListUsers, requireAdmin } from "@/lib/admin";
import { defaultAppLimit } from "@/lib/settings";
import { AppLimit } from "../../AppLimit";
import { Breadcrumbs } from "../../Breadcrumbs";
import { DefaultAppLimit } from "../DefaultAppLimit";

export default async function AdminUsersPage() {
  await requireAdmin();
  const rows = await adminListUsers();
  const defaultLimit = await defaultAppLimit();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Users" }]} />
      <h1 className="h3 mb-3">Users</h1>
      <Table responsive className="mb-4">
        <thead>
          <tr>
            <th>Username</th>
            <th>Registered</th>
            <th className="text-end">Apps</th>
            <th className="text-end">Own limit</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user) => (
            <tr key={user.id} data-testid={`user-${user.id}`}>
              <td>
                <Link href={`/admin/users/${user.id}`} data-testid="user-link">
                  {user.username ?? <span className="text-body-secondary">Not chosen yet</span>}
                </Link>
              </td>
              <td>{formatDay(isoDay(user.createdAt))}</td>
              <td className="text-end">{Number(user.appCount)}</td>
              <td className="text-end" data-testid="user-own-limit">
                {user.appLimit === null ? (
                  <span className="text-body-secondary" data-testid="user-limit-default">
                    Default: <DefaultAppLimit limit={defaultLimit} />
                  </span>
                ) : (
                  <AppLimit limit={user.appLimit} />
                )}
              </td>
              <td>{user.isAdmin && <i className="bi bi-check2" aria-label="Admin" />}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
