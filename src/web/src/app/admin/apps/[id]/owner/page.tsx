import { adminListOwners } from "@/lib/admin";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";
import { MoveApp } from "../MoveApp";

export default async function AdminOwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  const owners = await adminListOwners();
  return (
    <>
      <AdminAppTabs app={app} active="owner" />
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-arrow-left-right me-1" />
          Move to another user
        </div>
        <div className="card-body">
          <MoveApp appId={app.id} ownerId={app.ownerId} users={owners} />
        </div>
      </div>
    </>
  );
}
