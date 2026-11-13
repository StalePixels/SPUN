import type { NextRequest } from "next/server";
import { oauthErrorReply, oauthJson, readOAuthBody, registerClient } from "@/lib/oauthserver";
import { OAUTH_REDIRECT_URIS_MAX } from "@/lib/rules";

export async function POST(request: NextRequest) {
  const body = await readOAuthBody(request, "application/json");
  if ("refusal" in body) {
    return body.refusal;
  }
  let metadata: unknown = null;
  try {
    metadata = JSON.parse(body.text);
  } catch {}
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return oauthErrorReply(400, { code: "oauth.clientMetadata", max: OAUTH_REDIRECT_URIS_MAX });
  }
  const result = registerClient(metadata as Record<string, unknown>);
  return "error" in result ? oauthErrorReply(400, result.error) : oauthJson(201, result.client);
}
