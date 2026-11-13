import { apiJson, apiProblem, apiRoute, apiScreenshotParams, apiScreenshotUpload } from "@/lib/api";
import { clearOwnScreenshot } from "@/lib/screenshots";

type Params = { id: string; slot: string };

export const PUT = apiRoute<Params>({ body: "screenshot" }, async ({ request, user, params }) => {
  const target = apiScreenshotParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  return apiScreenshotUpload(user, target.appId, target.slot, request);
});

export const DELETE = apiRoute<Params>({ body: "json" }, async ({ user, params }) => {
  const target = apiScreenshotParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const { error } = await clearOwnScreenshot(user, target.appId, target.slot);
  return error ? apiProblem(error) : apiJson(200, {});
});
