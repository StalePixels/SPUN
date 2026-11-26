import { adminListAliases, adminListDotOverrides } from "@/lib/admin";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";
import { Aliases } from "../Aliases";
import { DotOverrides } from "../DotOverrides";

export default async function AdminNamesPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  const aliases = await adminListAliases(app.id);
  const overrides = await adminListDotOverrides(app.id);
  return (
    <>
      <AdminAppTabs app={app} active="names" />

      <div className="card mb-4" data-testid="aliases">
        <div className="card-header">
          <i className="bi bi-tags me-1" />
          Aliases
        </div>
        <div className="card-body">
          <Aliases appId={app.id} aliases={aliases} />
        </div>
      </div>

      <div className="card mb-4" data-testid="dot-overrides">
        <div className="card-header">
          <i className="bi bi-terminal me-1" />
          Reserved dot commands
        </div>
        <div className="card-body">
          <DotOverrides appId={app.id} names={overrides} />
        </div>
      </div>
    </>
  );
}
