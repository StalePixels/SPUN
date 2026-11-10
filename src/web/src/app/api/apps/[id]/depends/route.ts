import { apiBody, apiJson, apiProblem, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";
import { setOwnDepends } from "@/lib/depends";

export const PUT = apiRoute<{ id: string }>({ body: "json" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return apiProblem({ code: "app.notFound" });
  }
  const { error } = await setOwnDepends(user.id, appId, async () => {
    const { depends } = await apiBody(request);
    return Array.isArray(depends) ? depends.filter((value) => typeof value === "string") : [];
  });
  return error ? apiProblem(error) : apiJson(200, {});
});
