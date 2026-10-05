import { homeResponse, movedResponse } from "@/lib/markdown";

// The catalogue was here before it moved: its old URLs had a search or a page.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("q") || params.has("page")) {
    return movedResponse("/catalogue.md", request);
  }
  return homeResponse();
}
