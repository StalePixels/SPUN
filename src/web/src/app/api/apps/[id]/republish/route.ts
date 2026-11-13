import { apiBody, apiJson, apiProblem, apiRepublishFields, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";
import { republishOwnRelease } from "@/lib/releases";

export const POST = apiRoute<{ id: string }>({ body: "json" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return apiProblem({ code: "app.notFound" });
  }
  const result = await republishOwnRelease(user.id, appId, async () => apiRepublishFields(await apiBody(request)));
  return "error" in result ? apiProblem(result.error) : apiJson(201, { serial: result.serial, dotMoves: result.dotMoves });
});
