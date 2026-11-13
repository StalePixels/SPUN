import { apiProblem, apiReleaseUpload, apiRoute } from "@/lib/api";
import { parseAppId } from "@/lib/apps";

export const POST = apiRoute<{ id: string }>({ body: "release" }, async ({ request, user, params }) => {
  const appId = parseAppId(params.id);
  return appId ? apiReleaseUpload(user.id, appId, request) : apiProblem({ code: "app.notFound" });
});
