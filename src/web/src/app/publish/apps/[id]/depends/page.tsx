import { dependsApps, ownDependsChoices } from "@/lib/depends";
import { AppTabs, loadOwnApp } from "../AppTabs";
import { DependsForm } from "../DependsForm";

export default async function DependsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, app } = await loadOwnApp(params);
  const depends = await dependsApps(app.depends);
  const own = await ownDependsChoices(user.id, app.id);
  return (
    <>
      <AppTabs app={app} active="depends" />
      <div className="card mb-4" data-testid="depends">
        <div className="card-header">
          <i className="bi bi-diagram-3 me-1" />
          App dependencies
        </div>
        <div className="card-body">
          <DependsForm appId={app.id} depends={depends} own={own} />
        </div>
      </div>
    </>
  );
}
