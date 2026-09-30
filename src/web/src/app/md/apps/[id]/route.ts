import { appResponse } from "@/lib/markdown";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return appResponse((await params).id);
}
