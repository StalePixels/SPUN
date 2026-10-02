import { apiJson, apiRoute } from "@/lib/api";
import { ownAppRows } from "@/lib/catalogue";

export const GET = apiRoute({ body: "json" }, async ({ user }) => {
  return apiJson(200, { apps: await ownAppRows(user.id) });
});
