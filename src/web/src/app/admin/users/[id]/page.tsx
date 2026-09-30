import { notFound } from "next/navigation";
import { adminGetUser, requireAdmin } from "@/lib/admin";
import { formatDay, isoDay } from "@/lib/rules";
import { defaultAppLimit } from "@/lib/settings";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { DefaultAppLimit } from "../../DefaultAppLimit";
import { DeleteUser } from "./DeleteUser";
import { UserForm } from "./UserForm";
import { UsernameForm } from "./UsernameForm";
import { UserStatus } from "./UserStatus";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const user = await adminGetUser((await params).id);
  if (!user) {
    notFound();
  }
  const name = user.username ?? "No username yet";
  const defaultLimit = await defaultAppLimit();
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Users", href: "/admin/users" },
          { label: name },
        ]}
      />
      <h1 className="h3 mb-3">{name}</h1>
      <div className="card mb-4">
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-md-3">Email</dt>
            <dd className="col-md-9">{user.email}</dd>
            <dt className="col-md-3">Registered</dt>
            <dd className="col-md-9">{formatDay(isoDay(user.createdAt))}</dd>
            <dt className="col-md-3">Status</dt>
            <dd className="col-md-9 mb-0" data-testid="user-status">
              {user.disabledAt ? `Disabled ${formatDay(isoDay(user.disabledAt))}` : "Enabled"}
            </dd>
          </dl>
        </div>
      </div>
      <div className="card mb-4">
        <div className="card-body">
          <UserForm
            userId={user.id}
            appLimit={user.appLimit === null ? "" : String(user.appLimit)}
            isAdmin={user.isAdmin}
            defaultLimit={<DefaultAppLimit limit={defaultLimit} />}
          />
        </div>
      </div>
      {user.username && (
        <div className="card mb-4">
          <div className="card-body">
            <UsernameForm userId={user.id} username={user.username} />
          </div>
        </div>
      )}
      <div className="card border-danger mb-4">
        <div className="card-header text-danger border-danger">
          <i className="bi bi-exclamation-triangle me-1" />
          Disable or delete
        </div>
        <div className="card-body">
          <p>A disabled user cannot log in. Their apps stay public.</p>
          <div className="mb-3">
            <UserStatus key={user.disabledAt ? "disabled" : "enabled"} userId={user.id} disabled={user.disabledAt !== null} />
          </div>
          <DeleteUser userId={user.id} name={name} />
        </div>
      </div>
    </>
  );
}
