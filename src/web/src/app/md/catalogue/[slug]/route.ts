import { parseAppId } from "@/lib/apps";
import { appResponse, catalogueResponse } from "@/lib/markdown";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return parseAppId(slug) ? appResponse(slug) : catalogueResponse(slug, request);
}
