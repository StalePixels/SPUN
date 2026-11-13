import { authorizationServerMetadata } from "@/lib/oauth";
import { oauthJson, urls } from "@/lib/oauthserver";

export function GET() {
  return oauthJson(200, authorizationServerMetadata(urls()), { "Cache-Control": "public, max-age=3600" });
}
