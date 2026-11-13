import "server-only";
import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { oauthGrants, users } from "@/db/schema";
import { clientIp } from "./api";
import { serverKey } from "./apikeys";
import { apiLimits, rateCheck } from "./apigate";
import { db } from "./db";
import { requireEnv } from "./env";
import { newKeyId } from "./keys";
import {
  ACCESS_TOKEN_PREFIX,
  checkCodeExchange,
  checkRefresh,
  newSecret,
  oauthError,
  oauthUrls,
  parseRegistration,
  readClientId,
  REFRESH_TOKEN_PREFIX,
  responseUrl,
  signRegistration,
  tokenHash,
  type AuthorizeParams,
  type ClientMetadata,
  type CodeGrant,
  type OAuthUrls,
} from "./oauth";
import { problemMessage } from "./messages";
import type { Problem } from "./problems";
import { countHit, readValue, storeNewValue, storeValue, swapValue, takeValue } from "./redis";
import { OAUTH_ACCESS_SECONDS, OAUTH_CODE_SECONDS, OAUTH_REFRESH_SECONDS, OAUTH_USED_CODE_SECONDS } from "./rules";

export function urls(): OAuthUrls {
  return oauthUrls(requireEnv("AUTH_URL"));
}

export type OAuthClient = ClientMetadata & { id: string };

export type ClientLookup = { client: OAuthClient } | { error: Problem };

// Its own key, derived from the API key secret; an API key id cannot contain a hyphen.
function clientIdKey(): Buffer {
  return createHmac("sha256", serverKey()).update("oauth-client-id").digest();
}

export async function findClient(clientId: string): Promise<ClientLookup> {
  const client = readClientId(clientIdKey(), clientId);
  return client ? { client: { ...client, id: clientId } } : { error: { code: "oauth.unknownClient" } };
}

export function registerClient(body: Record<string, unknown>): { error: Problem } | { client: object } {
  const check = parseRegistration(body);
  if (!check.ok) {
    return { error: check.error };
  }
  const signed = signRegistration(clientIdKey(), check.client);
  if ("error" in signed) {
    return signed;
  }
  const { name, redirectUris } = check.client;
  return {
    client: {
      client_id: signed.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

function codeKey(code: string): string {
  return `oauth:code:${tokenHash(code)}`;
}

// The caller has checked the request with checkAuthorizeRequest().
export async function allowUrl(userId: string, client: OAuthClient, params: AuthorizeParams): Promise<string> {
  const code = newSecret();
  const grant: CodeGrant = {
    userId,
    clientId: client.id,
    clientName: client.name,
    redirectUri: params.redirectUri ?? "",
    codeChallenge: params.codeChallenge ?? "",
  };
  await storeValue(codeKey(code), JSON.stringify(grant), OAUTH_CODE_SECONDS);
  return responseUrl(grant.redirectUri, { code, state: params.state, iss: urls().issuer });
}

export function errorUrl(redirectUri: string, error: string, state: string | undefined): string {
  return responseUrl(redirectUri, { error, state, iss: urls().issuer });
}

export type TokenReply = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
};

function newTokens(now: Date) {
  const access = newSecret(ACCESS_TOKEN_PREFIX);
  const refresh = newSecret(REFRESH_TOKEN_PREFIX);
  return {
    reply: { access_token: access, token_type: "Bearer" as const, expires_in: OAUTH_ACCESS_SECONDS, refresh_token: refresh },
    columns: {
      accessHash: tokenHash(access),
      accessExpiresAt: new Date(now.getTime() + OAUTH_ACCESS_SECONDS * 1000),
      refreshHash: tokenHash(refresh),
      refreshExpiresAt: new Date(now.getTime() + OAUTH_REFRESH_SECONDS * 1000),
      lastUsedAt: now,
    },
  };
}

const userCanPublish = and(isNull(users.disabledAt), isNotNull(users.username));

const BAD_GRANT: { error: Problem } = { error: { code: "oauth.badGrant" } };

function usedCodeKey(code: string): string {
  return `oauth:used-code:${tokenHash(code)}`;
}

const REUSED = "reused";

async function endGrant(grantId: string): Promise<void> {
  await db()
    .update(oauthGrants)
    .set({ deletedAt: new Date() })
    .where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.deletedAt)));
}

// A code used again revokes the grant it made (OAuth 2.1 section 7.5.3). Each
// side of two uses at once marks Redis before it looks, so one of them sees the other.
async function revokeCodeGrant(code: string): Promise<void> {
  const grantId = await swapValue(usedCodeKey(code), REUSED, OAUTH_USED_CODE_SECONDS);
  if (grantId !== null && grantId !== REUSED) {
    await endGrant(grantId);
  }
}

async function freeGrantId(): Promise<string> {
  for (;;) {
    const id = newKeyId();
    const [taken] = await db().select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.id, id));
    if (!taken) {
      return id;
    }
  }
}

async function exchangeCode(params: Record<string, string>): Promise<{ error: Problem } | { tokens: TokenReply }> {
  const stored = params.code === undefined ? null : await takeValue(codeKey(params.code));
  if (stored === null && params.code !== undefined) {
    await revokeCodeGrant(params.code);
  }
  const code = stored === null ? null : (JSON.parse(stored) as CodeGrant);
  const error = checkCodeExchange(code, params, urls().resource);
  if (error || !code || params.code === undefined) {
    return error ? { error } : BAD_GRANT;
  }
  const [user] = await db()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, code.userId), userCanPublish));
  if (!user) {
    return BAD_GRANT;
  }
  const id = await freeGrantId();
  const used = usedCodeKey(params.code);
  if (!(await storeNewValue(used, id, OAUTH_USED_CODE_SECONDS))) {
    return BAD_GRANT;
  }
  const { reply, columns } = newTokens(new Date());
  await db()
    .insert(oauthGrants)
    .values({ id, userId: code.userId, clientIdHash: tokenHash(code.clientId), clientName: code.clientName, ...columns });
  if ((await readValue(used)) !== id) {
    await endGrant(id);
    return BAD_GRANT;
  }
  return { tokens: reply };
}

// A refresh token used again revokes its grant (OAuth 2.1 section 4.3.1); of
// two refreshes at once, the update lets only one win, and the other revokes.
async function revokeReusedRefresh(hash: string): Promise<void> {
  await db()
    .update(oauthGrants)
    .set({ deletedAt: new Date() })
    .where(and(eq(oauthGrants.previousRefreshHash, hash), isNull(oauthGrants.deletedAt)));
}

async function refreshTokens(params: Record<string, string>): Promise<{ error: Problem } | { tokens: TokenReply }> {
  const hash = params.refresh_token === undefined ? null : tokenHash(params.refresh_token);
  const [grant] = hash
    ? await db()
        .select({
          id: oauthGrants.id,
          clientIdHash: oauthGrants.clientIdHash,
          deletedAt: oauthGrants.deletedAt,
          refreshExpiresAt: oauthGrants.refreshExpiresAt,
        })
        .from(oauthGrants)
        .innerJoin(users, eq(users.id, oauthGrants.userId))
        .where(and(eq(oauthGrants.refreshHash, hash), userCanPublish))
    : [];
  const now = new Date();
  const error = checkRefresh(grant ?? null, params, urls().resource, now);
  if (hash && (!grant || error)) {
    await revokeReusedRefresh(hash);
  }
  if (error || !grant || !hash) {
    return error ? { error } : BAD_GRANT;
  }
  const { reply, columns } = newTokens(now);
  const [result] = await db()
    .update(oauthGrants)
    .set({ ...columns, previousRefreshHash: hash })
    .where(and(eq(oauthGrants.id, grant.id), eq(oauthGrants.refreshHash, hash), isNull(oauthGrants.deletedAt)));
  if (result.affectedRows === 1) {
    return { tokens: reply };
  }
  await revokeReusedRefresh(hash);
  return BAD_GRANT;
}

export async function tokenRequest(params: Record<string, string>): Promise<{ error: Problem } | { tokens: TokenReply }> {
  switch (params.grant_type) {
    case "authorization_code":
      return exchangeCode(params);
    case "refresh_token":
      return refreshTokens(params);
    case undefined:
      return { error: { code: "oauth.badRequest" } };
    default:
      return { error: { code: "oauth.grantType" } };
  }
}

export type GrantRow = { id: string; clientName: string; createdAt: Date; lastUsedAt: Date | null };

export async function listGrants(userId: string): Promise<GrantRow[]> {
  return db()
    .select({
      id: oauthGrants.id,
      clientName: oauthGrants.clientName,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .where(
      and(eq(oauthGrants.userId, userId), isNull(oauthGrants.deletedAt), gt(oauthGrants.refreshExpiresAt, new Date())),
    )
    .orderBy(desc(oauthGrants.createdAt), oauthGrants.id);
}

export async function revokeGrant(userId: string, grantId: string): Promise<void> {
  await db()
    .update(oauthGrants)
    .set({ deletedAt: new Date() })
    .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, userId), isNull(oauthGrants.deletedAt)));
}

export function oauthJson(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function oauthErrorReply(status: number, problem: Problem, retryAfter?: number): Response {
  return oauthJson(
    status,
    { error: oauthError(problem), error_description: problemMessage(problem) },
    retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) },
  );
}

function hasMediaType(contentType: string | null, mediaType: string): boolean {
  return contentType?.split(";")[0].trim().toLowerCase() === mediaType;
}

// The same per-address limit and JSON body limit as the signed API.
export async function readOAuthBody(
  request: NextRequest,
  mediaType: "application/json" | "application/x-www-form-urlencoded",
): Promise<{ text: string } | { refusal: Response }> {
  const limits = apiLimits();
  const wait = await rateCheck({ nowMs: () => Date.now(), count: countHit }, `oauth:${clientIp(request)}`, limits.ipPerMinute, 60);
  if (wait !== null) {
    return { refusal: oauthErrorReply(429, { code: "api.tooManyRequests" }, wait) };
  }
  if (!hasMediaType(request.headers.get("content-type"), mediaType)) {
    return { refusal: oauthErrorReply(400, { code: "oauth.contentType" }) };
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader === null) {
    return { refusal: oauthErrorReply(411, { code: "api.lengthRequired" }) };
  }
  const text = Number(lengthHeader) > limits.jsonBody ? null : await request.text();
  if (text === null || Buffer.byteLength(text) > limits.jsonBody) {
    return { refusal: oauthErrorReply(413, { code: "api.bodyTooLarge", max: limits.jsonBody }) };
  }
  return { text };
}
