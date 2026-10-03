import { apiJson, apiRoute } from "@/lib/api";
import { liveCategories } from "@/lib/categories";

export const GET = apiRoute({ body: "json" }, async () => {
  const categories = (await liveCategories()).map(({ id, name }) => ({ id, name }));
  return apiJson(200, { categories });
});
