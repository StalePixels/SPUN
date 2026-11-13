import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Problem, ProblemCode } from "./problems";
import {
  OAUTH_CLIENT_ID_MAX,
  OAUTH_CLIENT_NAME_MAX,
  OAUTH_REDIRECT_URI_MAX,
  OAUTH_REDIRECT_URIS_MAX,
} from "./rules";

export const ACCESS_TOKEN_PREFIX = "nbnspun-at-";
export const REFRESH_TOKEN_PREFIX = "nbnspun-rt-";

export type OAuthUrls = {
  issuer: string;
  resource: string;
  resourceMetadata: string;
  authorization: string;
  token: string;
  registration: string;
};

export function oauthUrls(authUrl: string): OAuthUrls {
  const issuer = new URL(authUrl).origin;
  return {
    issuer,
    resource: `${issuer}/mcp`,
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/mcp`,
    authorization: `${issuer}/oauth/authorize`,
    token: `${issuer}/oauth/token`,
    registration: `${issuer}/oauth/register`,
  };
}

export function protectedResourceMetadata(urls: OAuthUrls) {
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "SPUN",
  };
}

export function authorizationServerMetadata(urls: OAuthUrls) {
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorization,
    token_endpoint: urls.token,
    registration_endpoint: urls.registration,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function newSecret(prefix = ""): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// "plain", and a missing method (which means plain), are refused.
export function checkChallenge(challenge: string | undefined, method: string | undefined): Problem | null {
  return challenge !== undefined && CHALLENGE_RE.test(challenge) && method === "S256" ? null : { code: "oauth.pkce" };
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(s256(verifier)), Buffer.from(challenge));
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function checkRedirectUri(value: string): boolean {
  const url = parseUrl(value);
  if (!url || value.length > OAUTH_REDIRECT_URI_MAX || value.includes("#") || url.username || url.password) {
    return false;
  }
  return url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
}

export function isLoopbackRedirect(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
}

export function redirectHost(value: string): string {
  return parseUrl(value)?.host ?? value;
}

// Exact match, except the port of a loopback URL: a native client takes a free
// port when it starts (RFC 8252 section 7.3, RFC 9700 section 2.1).
export function redirectUriMatches(registered: string[], given: string): boolean {
  if (!checkRedirectUri(given)) {
    return false;
  }
  if (registered.includes(given)) {
    return true;
  }
  if (!isLoopbackRedirect(given)) {
    return false;
  }
  const want = new URL(given);
  return registered.some((value) => {
    const url = isLoopbackRedirect(value) ? new URL(value) : null;
    return url !== null && url.hostname === want.hostname && url.pathname === want.pathname && url.search === want.search;
  });
}

// Scheme and host in any case, and a trailing slash, as RFC 8707 clients differ.
export function resourceMatches(given: string | undefined, expected: string): boolean {
  const url = given === undefined ? null : parseUrl(given);
  if (!url || given?.includes("#") || url.search || url.username || url.password) {
    return false;
  }
  return `${url.origin}${url.pathname.replace(/\/$/, "")}` === expected;
}

export type ClientMetadata = { name: string; redirectUris: string[] };

export const SIGNED_CLIENT_ID_PREFIX = "spunc1.";

function clientIdMac(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(`${SIGNED_CLIENT_ID_PREFIX}${body}`).digest("base64url");
}

// Dynamic registration stores nothing: the client_id carries the client's name and redirect URIs, signed.
export function signClientId(key: Buffer, client: ClientMetadata): string {
  const body = Buffer.from(JSON.stringify([client.name, client.redirectUris])).toString("base64url");
  return `${SIGNED_CLIENT_ID_PREFIX}${body}.${clientIdMac(key, body)}`;
}

export function readClientId(key: Buffer, clientId: string): ClientMetadata | null {
  const match = /^spunc1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(clientId);
  if (!match || !timingSafeEqual(Buffer.from(clientIdMac(key, match[1])), Buffer.from(match[2]))) {
    return null;
  }
  let value: unknown = null;
  try {
    value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {}
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    !Array.isArray(value[1]) ||
    !value[1].every((uri) => typeof uri === "string")
  ) {
    return null;
  }
  return { name: value[0], redirectUris: value[1] as string[] };
}

export function signRegistration(key: Buffer, client: ClientMetadata): { clientId: string } | { error: Problem } {
  const clientId = signClientId(key, client);
  return clientId.length > OAUTH_CLIENT_ID_MAX
    ? { error: { code: "oauth.clientTooLarge", max: OAUTH_CLIENT_ID_MAX } }
    : { clientId };
}

export type ClientCheck = { ok: true; client: ClientMetadata } | { ok: false; error: Problem };

export function cleanClientName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = Array.from(value.replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim()).slice(0, OAUTH_CLIENT_NAME_MAX).join("");
  return name === "" ? null : name.trim();
}

function checkRedirectUris(value: unknown): Problem | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > OAUTH_REDIRECT_URIS_MAX ||
    !value.every((uri) => typeof uri === "string")
  ) {
    return { code: "oauth.clientMetadata", max: OAUTH_REDIRECT_URIS_MAX };
  }
  return value.every((uri) => checkRedirectUri(uri)) ? null : { code: "oauth.badRedirectUri" };
}

function onlyCodeFlow(body: Record<string, unknown>): boolean {
  const list = (value: unknown, allowed: string[], needed: string) =>
    value === undefined ||
    (Array.isArray(value) && value.includes(needed) && value.every((item) => allowed.includes(item)));
  return (
    list(body.grant_types, ["authorization_code", "refresh_token"], "authorization_code") &&
    list(body.response_types, ["code"], "code")
  );
}

// Dynamic registration. Every client is public: a requested
// token_endpoint_auth_method is replaced by "none" (RFC 7591 section 3.2.1).
export function parseRegistration(body: Record<string, unknown>): ClientCheck {
  const uriError = checkRedirectUris(body.redirect_uris);
  if (uriError) {
    return { ok: false, error: uriError };
  }
  if (!onlyCodeFlow(body)) {
    return { ok: false, error: { code: "oauth.clientMetadata", max: OAUTH_REDIRECT_URIS_MAX } };
  }
  const redirectUris = body.redirect_uris as string[];
  return {
    ok: true,
    client: { name: cleanClientName(body.client_name) ?? redirectHost(redirectUris[0]), redirectUris },
  };
}

export type AuthorizeParams = {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  resource?: string;
};

const AUTHORIZE_NAMES: Record<keyof AuthorizeParams, string> = {
  responseType: "response_type",
  clientId: "client_id",
  redirectUri: "redirect_uri",
  state: "state",
  codeChallenge: "code_challenge",
  codeChallengeMethod: "code_challenge_method",
  resource: "resource",
};

export const AUTHORIZE_FIELDS = Object.entries(AUTHORIZE_NAMES) as [keyof AuthorizeParams, string][];

// null when a parameter is given more than once (RFC 6749 section 3.1).
export function parseAuthorizeParams(
  query: Record<string, string | string[] | undefined>,
): AuthorizeParams | null {
  const params: AuthorizeParams = {};
  for (const [key, name] of AUTHORIZE_FIELDS) {
    const value = query[name];
    if (Array.isArray(value)) {
      return null;
    }
    if (value !== undefined && value !== "") {
      params[key] = value;
    }
  }
  return params;
}

export function authorizeQuery(params: AuthorizeParams): string {
  const search = new URLSearchParams();
  for (const [key, name] of AUTHORIZE_FIELDS) {
    const value = params[key];
    if (value !== undefined) {
      search.set(name, value);
    }
  }
  return search.toString();
}

// An error with redirect false is shown on SPUN's page: without a known
// client and a registered redirect URI, a redirect could go anywhere.
export type AuthorizeCheck = { ok: true } | { ok: false; error: Problem; redirect: boolean };

export function checkAuthorizeRequest(
  params: AuthorizeParams,
  client: ClientMetadata | null,
  resource: string,
): AuthorizeCheck {
  if (!client) {
    return { ok: false, error: { code: "oauth.unknownClient" }, redirect: false };
  }
  if (params.redirectUri === undefined || !redirectUriMatches(client.redirectUris, params.redirectUri)) {
    return { ok: false, error: { code: "oauth.redirectUri" }, redirect: false };
  }
  if (params.responseType !== "code") {
    return { ok: false, error: { code: "oauth.responseType" }, redirect: true };
  }
  const pkce = checkChallenge(params.codeChallenge, params.codeChallengeMethod);
  if (pkce) {
    return { ok: false, error: pkce, redirect: true };
  }
  if (!resourceMatches(params.resource, resource)) {
    return { ok: false, error: { code: "oauth.resource" }, redirect: true };
  }
  return { ok: true };
}

export function responseUrl(redirectUri: string, values: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  return url.href;
}

const OAUTH_ERRORS: Partial<Record<ProblemCode, string>> = {
  "oauth.badRequest": "invalid_request",
  "oauth.unknownClient": "invalid_client",
  "oauth.clientMetadata": "invalid_client_metadata",
  "oauth.clientTooLarge": "invalid_client_metadata",
  "oauth.badRedirectUri": "invalid_redirect_uri",
  "oauth.redirectUri": "invalid_request",
  "oauth.responseType": "unsupported_response_type",
  "oauth.pkce": "invalid_request",
  "oauth.resource": "invalid_target",
  "oauth.grantType": "unsupported_grant_type",
  "oauth.badGrant": "invalid_grant",
  "oauth.denied": "access_denied",
  "api.tooManyRequests": "temporarily_unavailable",
};

export function oauthError(problem: Problem): string {
  return OAUTH_ERRORS[problem.code] ?? "invalid_request";
}

// null when a parameter is given more than once (RFC 6749 section 3.2).
export function parseFormBody(text: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [name, value] of new URLSearchParams(text)) {
    if (Object.hasOwn(params, name)) {
      return null;
    }
    params[name] = value;
  }
  return params;
}

export type CodeGrant = {
  userId: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
};

export function checkCodeExchange(
  code: CodeGrant | null,
  params: Record<string, string>,
  resource: string,
): Problem | null {
  if (params.code_verifier === undefined) {
    return { code: "oauth.pkce" };
  }
  if (params.resource !== undefined && !resourceMatches(params.resource, resource)) {
    return { code: "oauth.resource" };
  }
  if (
    !code ||
    params.client_id !== code.clientId ||
    (params.redirect_uri !== undefined && params.redirect_uri !== code.redirectUri) ||
    !pkceMatches(params.code_verifier, code.codeChallenge)
  ) {
    return { code: "oauth.badGrant" };
  }
  return null;
}

export type GrantState = { clientIdHash: string; deletedAt: Date | null; refreshExpiresAt: Date };

export function checkRefresh(
  grant: GrantState | null,
  params: Record<string, string>,
  resource: string,
  now: Date,
): Problem | null {
  if (params.resource !== undefined && !resourceMatches(params.resource, resource)) {
    return { code: "oauth.resource" };
  }
  if (
    !grant ||
    params.client_id === undefined ||
    tokenHash(params.client_id) !== grant.clientIdHash ||
    grant.deletedAt !== null ||
    grant.refreshExpiresAt <= now
  ) {
    return { code: "oauth.badGrant" };
  }
  return null;
}

