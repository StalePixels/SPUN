import { catalogueResponse } from "@/lib/markdown";

export async function GET(request: Request) {
  return catalogueResponse(null, request);
}
