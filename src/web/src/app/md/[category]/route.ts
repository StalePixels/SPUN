import { catalogueResponse } from "@/lib/markdown";

export async function GET(request: Request, { params }: { params: Promise<{ category: string }> }) {
  return catalogueResponse((await params).category, request);
}
