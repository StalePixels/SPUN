import { apiAppFields, apiBody, apiJson, apiProblem, apiRoute } from "@/lib/api";
import { addApp } from "@/lib/apps";
import { ownAppRows } from "@/lib/catalogue";

export const GET = apiRoute({ body: "json" }, async ({ user }) => {
  return apiJson(200, { apps: await ownAppRows(user.id) });
});

export const POST = apiRoute({ body: "json" }, async ({ request, user }) => {
  const result = await addApp(user.id, apiAppFields(await apiBody(request)));
  return "error" in result ? apiProblem(result.error) : apiJson(201, { id: result.id });
});
