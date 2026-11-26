import { liveCategories } from "@/lib/categories";
import { appCount, appLimit } from "@/lib/limits";
import { problemMessage } from "@/lib/messages";
import { canCreateApp } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { AppForm } from "../../AppForm";
import { PublishMenu } from "../PublishMenu";

export default async function NewApp() {
  const user = await requirePublisher();
  const limit = await appLimit(user.id);
  const canCreate = canCreateApp(await appCount(user.id), limit);
  const categories = await liveCategories();
  return (
    <>
      <PublishMenu active="new" />
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          App details
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
