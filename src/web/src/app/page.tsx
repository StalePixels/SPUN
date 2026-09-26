import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { apps } from "@/db/schema";
import { db } from "@/lib/db";
import { appCount, appLimit } from "@/lib/limits";
import { problemMessage } from "@/lib/messages";
import { canCreateApp } from "@/lib/rules";
import { currentUser } from "@/lib/session";
import { logIn } from "./actions";
import { AppForm } from "./AppForm";

export default async function Home() {
  const user = await currentUser();
  if (!user) {
    return (
      <div className="card mx-auto" style={{ maxWidth: "28rem" }}>
        <div className="card-body">
          <form action={logIn}>
            <p>Log in with your Next Best Network account to publish apps.</p>
            <button type="submit" className="btn btn-primary" data-testid="login">
              <i className="bi bi-box-arrow-in-right me-1" />
              Log in
            </button>
          </form>
        </div>
      </div>
    );
  }
  if (!user.username) {
    redirect("/username");
  }
  const rows = await db()
    .select({ id: apps.id, title: apps.title })
    .from(apps)
    .where(and(eq(apps.userId, user.id), isNull(apps.deletedAt)))
    .orderBy(asc(apps.title));
  const limit = await appLimit(user.id);
  const canCreate = canCreateApp(await appCount(user.id), limit);
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
              href={`/apps/${app.id}`}
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
            <AppForm />
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
