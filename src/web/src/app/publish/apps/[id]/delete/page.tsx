import { AppTabs, loadOwnApp } from "../AppTabs";
import { DeleteApp } from "../DeleteApp";

export default async function DeletePage({ params }: { params: Promise<{ id: string }> }) {
  const { app } = await loadOwnApp(params);
  return (
    <>
      <AppTabs app={app} active="delete" />
      <div className="card border-danger mb-4">
        <div className="card-header text-danger border-danger">
          <i className="bi bi-exclamation-triangle me-1" />
          Delete app
        </div>
        <div className="card-body">
          <p>Deleting the app removes its release files. The app id cannot be used again.</p>
          <DeleteApp appId={app.id} />
        </div>
      </div>
    </>
  );
}
