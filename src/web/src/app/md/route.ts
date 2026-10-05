import { movedResponse } from "@/lib/markdown";

export async function GET(request: Request) {
  return movedResponse("/catalogue.md", request);
}
