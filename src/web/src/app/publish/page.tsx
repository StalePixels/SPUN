import Link from "next/link";
import { ownAppRows } from "@/lib/catalogue";
import { requirePublisher } from "@/lib/session";
import { PublishMenu } from "./PublishMenu";

export default async function Publish() {
  const user = await requirePublisher();
  const rows = await ownAppRows(user.id);
  return (
    <>
      <PublishMenu active="apps" />
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-box me-1" />
          Apps
        </div>
        {rows.length === 0 ? (
          <div className="card-body">
            <p className="text-body-secondary mb-0">
              You have no apps yet. Create one under <Link href="/publish/new">New app</Link>.
            </p>
          </div>
        ) : (
          <div className="list-group list-group-flush">
            {rows.map((app) => (
              <Link
                key={app.id}
                data-testid={`app-${app.id}`}
                href={`/publish/apps/${app.id}`}
                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              >
                <span className="fw-medium">{app.title}</span>
                <code>{app.id}</code>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
