import type { NextRequest } from "next/server";
import { parseFormBody } from "@/lib/oauth";
import { oauthErrorReply, oauthJson, readOAuthBody, tokenRequest } from "@/lib/oauthserver";

export async function POST(request: NextRequest) {
  const body = await readOAuthBody(request, "application/x-www-form-urlencoded");
  if ("refusal" in body) {
    return body.refusal;
  }
  const params = parseFormBody(body.text);
  if (!params) {
    return oauthErrorReply(400, { code: "oauth.badRequest" });
  }
  const result = await tokenRequest(params);
  return "error" in result ? oauthErrorReply(400, result.error) : oauthJson(200, result.tokens, { Pragma: "no-cache" });
}
