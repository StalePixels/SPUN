import { apiForm, apiJson, apiProblem, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";
import { uploadOwnRelease } from "@/lib/releases";

export const POST = apiRoute<{ id: string }>({ body: "release" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  if (!appId) {
    return apiProblem({ code: "app.notFound" });
  }
  const result = await uploadOwnRelease(user.id, appId, () => apiForm(request));
  return "error" in result ? apiProblem(result.error) : apiJson(201, { serial: result.serial, dotMoves: result.dotMoves });
});
