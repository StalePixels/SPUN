import { notFound } from "next/navigation";
import { adminGetUser, requireAdmin } from "@/lib/admin";
import { formatDay, isoDay } from "@/lib/rules";
import { defaultAppLimit } from "@/lib/settings";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { DefaultAppLimit } from "../../DefaultAppLimit";
import { UserForm } from "./UserForm";

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
            <dd className="col-md-9 mb-0">{formatDay(isoDay(user.createdAt))}</dd>
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
    </>
  );
}
