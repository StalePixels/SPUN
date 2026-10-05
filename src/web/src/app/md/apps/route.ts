import { liveCategory } from "@/lib/categories";
import { movedResponse } from "@/lib/markdown";

export async function GET(request: Request) {
  if (!(await liveCategory("apps"))) {
    return new Response(null, { status: 404 });
  }
  return movedResponse("/catalogue/apps.md", request);
}
