import { apiBody, apiChangelog, apiJson, apiProblem, apiReleaseParams, apiRoute } from "@/lib/api";
import { editChangelog } from "@/lib/releases";

export const PUT = apiRoute<{ id: string; serial: string }>({ body: "json" }, async ({ request, user, params }) => {
  const target = apiReleaseParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const { error } = await editChangelog(user.id, target.appId, target.serial, async () =>
    apiChangelog(await apiBody(request)),
  );
  return error ? apiProblem(error) : apiJson(200, {});
});
