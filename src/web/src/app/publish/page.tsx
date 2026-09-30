import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { apps } from "@/db/schema";
import { liveCategories } from "@/lib/categories";
import { db } from "@/lib/db";
import { appCount, appLimit } from "@/lib/limits";
import { problemMessage } from "@/lib/messages";
import { canCreateApp } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { AppForm } from "../AppForm";

export default async function Publish() {
  const user = await requirePublisher();
  const rows = await db()
    .select({ id: apps.id, title: apps.title })
    .from(apps)
    .where(and(eq(apps.userId, user.id), isNull(apps.deletedAt)))
    .orderBy(asc(apps.title));
  const limit = await appLimit(user.id);
  const canCreate = canCreateApp(await appCount(user.id), limit);
  const categories = await liveCategories();
  return (
    <>
      <h1 className="h3 mb-3">Your apps</h1>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4">You have no apps yet. Create one below.</p>
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
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-plus-lg me-1" />
          New app
        </div>
        <div className="card-body">
          {canCreate ? (
            <AppForm categories={categories} />
          ) : (
            <p className="mb-0" data-testid="app-limit-reached">
              {problemMessage({ code: "app.limitReached", limit })} You have reached that limit.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
