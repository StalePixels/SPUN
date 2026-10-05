import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { appCount, appLimit } from "@/lib/limits";
import { requirePublisher } from "@/lib/session";
import { AppLimit } from "../AppLimit";
import { MeMenu } from "./MeMenu";

export default async function Me() {
  const user = await requirePublisher();
  const [row] = await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, user.id));
  const count = await appCount(user.id);
  const limit = await appLimit(user.id);
  return (
    <>
      <MeMenu active="account" />
      <h1 className="h3 mb-3" data-testid="me-heading">Your account</h1>
      <dl className="row mb-4">
        <dt className="col-sm-3">Username</dt>
        <dd className="col-sm-9" data-testid="me-username">{user.username}</dd>
        <dt className="col-sm-3">Name</dt>
        <dd className="col-sm-9" data-testid="me-name">{row?.name}</dd>
        <dt className="col-sm-3">Email</dt>
        <dd className="col-sm-9" data-testid="me-email">{row?.email}</dd>
        <dt className="col-sm-3">Apps</dt>
        <dd className="col-sm-9" data-testid="me-apps">
          {count} of <AppLimit limit={limit} />
        </dd>
      </dl>
    </>
  );
}
