import { rateCheck, type ApiLimits, type ApiRefusal, type ApiUser } from "./apigate";
import { ACCESS_TOKEN_PREFIX, tokenHash } from "./oauth";
import type { Problem } from "./problems";
import { mustAcceptTerms } from "./rules";

export const MCP_TOUCH_SECONDS = 60;

export type McpCall = {
  ip: string;
  header(name: string): string | null;
  text(): Promise<string>;
};

export type McpGrant = {
  id: string;
  clientIdHash: string;
  userId: string;
  username: string | null;
  userDisabled: boolean;
  deletedAt: Date | null;
  accessExpiresAt: Date;
  acceptedTermsId: number | null;
};

export type McpDeps = {
  nowMs(): number;
  limits: ApiLimits;
  findGrant(accessHash: string): Promise<McpGrant | null>;
  currentTermsId(): Promise<number | null>;
  claimOnce(name: string, ttlSeconds: number): Promise<boolean>;
  count(name: string, ttlSeconds: number): Promise<number>;
  touchGrant(grantId: string, now: Date): Promise<void>;
};

// body is null when the request body is not JSON.
export type McpGateResult =
  | {
      ok: true;
      user: ApiUser;
      grant: { id: string; clientIdHash: string; accessExpiresAt: Date };
      body: { value: unknown } | null;
    }
  | ({ ok: false } & ApiRefusal);

function refuse(status: number, error: Problem, retryAfter?: number): { ok: false } & ApiRefusal {
  return retryAfter === undefined ? { ok: false, status, error } : { ok: false, status, error, retryAfter };
}

// RFC 6750 section 2.1: the scheme is case-insensitive; anything else counts as no token.
export function bearerToken(header: string | null): string | null {
  const match = header === null ? null : /^Bearer +(\S+) *$/i.exec(header);
  return match ? match[1] : null;
}

function checkSize(call: McpCall, limits: ApiLimits): ({ ok: false } & ApiRefusal) | null {
  const length = call.header("content-length");
  if (length === null) {
    return refuse(411, { code: "api.lengthRequired" });
  }
  return Number(length) > limits.jsonBody ? refuse(413, { code: "api.bodyTooLarge", max: limits.jsonBody }) : null;
}

function parseBody(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}

// A JSON-RPC batch counts once for each message in it.
function messageCount(body: { value: unknown } | null): number {
  return body !== null && Array.isArray(body.value) ? Math.max(1, body.value.length) : 1;
}

function grantUsable(grant: McpGrant | null, now: Date): grant is McpGrant & { username: string } {
  return (
    grant !== null &&
    grant.deletedAt === null &&
    grant.accessExpiresAt > now &&
    !grant.userDisabled &&
    grant.username !== null
  );
}

// Only local programs use /mcp, and they send no Origin; a browser always does (MCP transports, Origin check).
export async function checkMcpCall(call: McpCall, deps: McpDeps): Promise<McpGateResult> {
  if (call.header("origin") !== null) {
    return refuse(403, { code: "mcp.origin" });
  }
  const size = checkSize(call, deps.limits);
  if (size) {
    return size;
  }
  const text = await call.text();
  if (Buffer.byteLength(text) > deps.limits.jsonBody) {
    return refuse(413, { code: "api.bodyTooLarge", max: deps.limits.jsonBody });
  }
  const body = parseBody(text);
  const hits = messageCount(body);
  const ipWait = await rateCheck(deps, `mcp:${call.ip}`, deps.limits.ipPerMinute, 60, hits);
  if (ipWait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, ipWait);
  }
  const token = bearerToken(call.header("authorization"));
  if (token === null) {
    return refuse(401, { code: "mcp.noToken" });
  }
  const grant = token.startsWith(ACCESS_TOKEN_PREFIX) ? await deps.findGrant(tokenHash(token)) : null;
  const now = new Date(deps.nowMs());
  if (!grantUsable(grant, now)) {
    return refuse(401, { code: "mcp.badToken" });
  }
  const grantWait = await rateCheck(deps, `grant:${grant.id}`, deps.limits.keyPerMinute, 60, hits);
  if (grantWait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, grantWait);
  }
  if (mustAcceptTerms(grant.acceptedTermsId, await deps.currentTermsId())) {
    return refuse(403, { code: "api.termsNotAccepted" });
  }
  if (await deps.claimOnce(`mcp:touch:${grant.id}`, MCP_TOUCH_SECONDS)) {
    await deps.touchGrant(grant.id, now);
  }
  return {
    ok: true,
    user: { id: grant.userId, username: grant.username },
    grant: { id: grant.id, clientIdHash: grant.clientIdHash, accessExpiresAt: grant.accessExpiresAt },
    body,
  };
}

// RFC 6750 section 3.1: no error code when the request carried no token.
export function wwwAuthenticate(resourceMetadata: string, error: Problem): string {
  const code = error.code === "mcp.badToken" ? ', error="invalid_token"' : "";
  return `Bearer resource_metadata="${resourceMetadata}"${code}`;
}
