import { apiResponse } from "@/lib/markdown";

export const dynamic = "force-static";

export function GET() {
  return apiResponse();
}
