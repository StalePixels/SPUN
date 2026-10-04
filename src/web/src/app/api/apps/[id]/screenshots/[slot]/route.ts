import { apiForm, apiJson, apiProblem, apiRoute, apiScreenshotParams } from "@/lib/api";
import { clearOwnScreenshot, uploadOwnScreenshot } from "@/lib/screenshots";

type Params = { id: string; slot: string };

export const PUT = apiRoute<Params>({ body: "screenshot" }, async ({ request, user, params }) => {
  const target = apiScreenshotParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const result = await uploadOwnScreenshot(user, target.appId, target.slot, () => apiForm(request));
  return "error" in result ? apiProblem(result.error) : apiJson(200, { slot: target.slot, width: result.width });
});

export const DELETE = apiRoute<Params>({ body: "json" }, async ({ user, params }) => {
  const target = apiScreenshotParams(params);
  if ("error" in target) {
    return apiProblem(target.error);
  }
  const { error } = await clearOwnScreenshot(user, target.appId, target.slot);
  return error ? apiProblem(error) : apiJson(200, {});
});
