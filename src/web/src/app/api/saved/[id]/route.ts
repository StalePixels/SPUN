import { apiJson, apiProblem, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";
import { saveApp, unsaveApp } from "@/lib/saved";

const notFound = () => apiProblem({ code: "app.notFound" });

export const PUT = apiRoute<{ id: string }>({ body: "json" }, async ({ user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return notFound();
  }
  const { error } = await saveApp(user.id, appId);
  return error ? apiProblem(error) : apiJson(200, {});
});

export const DELETE = apiRoute<{ id: string }>({ body: "json" }, async ({ user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return notFound();
  }
  await unsaveApp(user.id, appId);
  return apiJson(200, {});
});
