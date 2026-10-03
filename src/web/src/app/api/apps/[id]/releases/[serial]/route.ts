import { apiJson, apiProblem, apiReleaseParams, apiRoute } from "@/lib/api";
import { deleteOwnRelease, ownReleaseView } from "@/lib/releases";

type Params = { id: string; serial: string };

export const GET = apiRoute<Params>({ body: "json" }, async ({ user, params }) => {
  const target = apiReleaseParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const result = await ownReleaseView(user, target.appId, target.serial);
  return "error" in result ? apiProblem(result.error) : apiJson(200, result.value);
});

export const DELETE = apiRoute<Params>({ body: "json" }, async ({ user, params }) => {
  const target = apiReleaseParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const { error } = await deleteOwnRelease(user, target.appId, target.serial);
  return error ? apiProblem(error) : apiJson(200, {});
});
