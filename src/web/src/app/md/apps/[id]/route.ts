import { movedResponse } from "@/lib/markdown";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return movedResponse(`/catalogue/${encodeURIComponent((await params).id)}.md`, request);
}
