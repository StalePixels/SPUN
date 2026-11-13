import { protectedResourceMetadata } from "@/lib/oauth";
import { oauthJson, urls } from "@/lib/oauthserver";

export function GET() {
  return oauthJson(200, protectedResourceMetadata(urls()), { "Cache-Control": "public, max-age=3600" });
}
