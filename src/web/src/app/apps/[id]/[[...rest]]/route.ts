import { movedResponse } from "@/lib/markdown";

// App pages and their downloads and screenshots were under /apps before the catalogue moved.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; rest?: string[] }> }) {
  const { id, rest = [] } = await params;
  return movedResponse(`/catalogue/${[id, ...rest].map(encodeURIComponent).join("/")}`, request);
}
