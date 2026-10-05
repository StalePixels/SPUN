import { liveCategory } from "@/lib/categories";
import { movedResponse } from "@/lib/markdown";

export async function GET(request: Request, { params }: { params: Promise<{ category: string }> }) {
  const category = await liveCategory((await params).category);
  if (!category) {
    return new Response(null, { status: 404 });
  }
  return movedResponse(`/catalogue/${category.slug}.md`, request);
}
