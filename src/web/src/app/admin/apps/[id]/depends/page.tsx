import Link from "next/link";
import { adminDependsApps, adminDependsChoices, adminListDepends, adminListNeededBy } from "@/lib/admin";
import { DependsForm } from "../../../../publish/apps/[id]/DependsForm";
import { findAdminDepends, saveAdminDepends } from "../../../actions";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";

export default async function AdminDependsPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  const depends = await adminDependsApps(await adminListDepends(app.id));
  const own = await adminDependsChoices(app.ownerId, app.id);
  const dependants = await adminListNeededBy(app.id);
  return (
    <>
      <AdminAppTabs app={app} active="depends" />

      <div className="card mb-4" data-testid="depends">
        <div className="card-header">
          <i className="bi bi-diagram-3 me-1" />
          App dependencies
        </div>
        <div className="card-body">
          <DependsForm
            appId={app.id}
            depends={depends}
            own={own}
            owner={app.owner ?? app.ownerId}
            save={saveAdminDepends.bind(null, app.id)}
            find={findAdminDepends.bind(null, app.id)}
          />
        </div>
      </div>

      <div className="card mb-4" data-testid="needed-by">
        <div className="card-header">
          <i className="bi bi-diagram-3 me-1" />
          Needed by
        </div>
        <div className="card-body">
          {dependants.length === 0 ? (
            <p className="text-body-secondary mb-0" data-testid="needed-by-none">No app lists this app as a dependency.</p>
          ) : (
            <ul className="list-group">
              {dependants.map((dependant) => (
                <li key={dependant.id} className="list-group-item" data-testid={`needed-by-${dependant.id}`}>
                  <Link href={`/admin/apps/${dependant.id}`}>{dependant.title}</Link>{" "}
                  <code className="ms-1">{dependant.id}</code>
                  {dependant.deleted && <span className="text-body-secondary ms-2">Deleted</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
