import Button from "react-bootstrap/Button";
import { DeleteApp } from "../../../../publish/apps/[id]/DeleteApp";
import { deleteAdminApp, restoreAdminApp } from "../../../actions";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";

export default async function AdminDeletePage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  return (
    <>
      <AdminAppTabs app={app} active="delete" />
      {app.deletedAt ? (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-arrow-counterclockwise me-1" />
            Restore app
          </div>
          <div className="card-body">
            <p>Restoring the app puts back the files of its releases that are not deleted.</p>
            <form action={restoreAdminApp.bind(null, app.id)}>
              <Button data-testid="restore-app" type="submit" variant="outline-primary">
                <i className="bi bi-arrow-counterclockwise me-1" />
                Restore app
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card border-danger mb-4">
          <div className="card-header text-danger border-danger">
            <i className="bi bi-exclamation-triangle me-1" />
            Delete app
          </div>
          <div className="card-body">
            <p>Deleting the app moves its release files to the recycle bin.</p>
            <DeleteApp appId={app.id} remove={deleteAdminApp} />
          </div>
        </div>
      )}
    </>
  );
}
