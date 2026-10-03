import { apiAppFields, apiBody, apiJson, apiProblem, apiRoute } from "@/lib/api";
import { deleteOwnApp, editApp, ownAppView, parseAppId } from "@/lib/apps";

const notFound = () => apiProblem({ code: "app.notFound" });

export const GET = apiRoute<{ id: string }>({ body: "json" }, async ({ user, params }) => {
  const appId = parseAppId(params.id);
  const view = appId ? await ownAppView(user.id, appId) : null;
  return view ? apiJson(200, view) : notFound();
});

export const PUT = apiRoute<{ id: string }>({ body: "json" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return notFound();
  }
  const { error } = await editApp(user.id, appId, async () => apiAppFields(await apiBody(request)));
  return error ? apiProblem(error) : apiJson(200, {});
});

export const DELETE = apiRoute<{ id: string }>({ body: "json" }, async ({ user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return notFound();
  }
  const { error } = await deleteOwnApp(user, appId);
  return error ? apiProblem(error) : apiJson(200, {});
});
