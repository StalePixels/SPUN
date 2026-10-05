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
      <h1 className="h3 mb-3">Your apps</h1>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4">
          You have no apps yet. Create one under <Link href="/publish/new">New app</Link>.
        </p>
      ) : (
        <div className="list-group mb-4">
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
    </>
  );
}
