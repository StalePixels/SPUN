import { apiJson, apiRoute } from "@/lib/api";
import { savedAppRows } from "@/lib/catalogue";

export const GET = apiRoute({ body: "json" }, async ({ user }) => {
  return apiJson(200, { saved: await savedAppRows(user.id) });
});
