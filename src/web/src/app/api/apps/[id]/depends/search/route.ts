import { apiJson, apiProblem, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";
import { searchOwnDepends } from "@/lib/depends";

export const GET = apiRoute<{ id: string }>({ body: "json" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return apiProblem({ code: "app.notFound" });
  }
  const result = await searchOwnDepends(user.id, appId, request.nextUrl.searchParams.get("q") ?? "");
  return "error" in result ? apiProblem(result.error) : apiJson(200, { apps: result.apps });
});
