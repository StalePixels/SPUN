import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizationServerMetadata,
  authorizeQuery,
  checkAuthorizeRequest,
  checkChallenge,
  checkCodeExchange,
  checkRedirectUri,
  checkRefresh,
  cleanClientName,
  oauthError,
  oauthUrls,
  parseAuthorizeParams,
  parseFormBody,
  parseRegistration,
  pkceMatches,
  protectedResourceMetadata,
  readClientId,
  redirectUriMatches,
  resourceMatches,
  responseUrl,
  s256,
  signClientId,
  signRegistration,
  tokenHash,
  type CodeGrant,
} from "./oauth";
import { OAUTH_CLIENT_ID_MAX, OAUTH_CLIENT_NAME_MAX, OAUTH_REDIRECT_URI_MAX, OAUTH_REDIRECT_URIS_MAX } from "./rules";

const urls = oauthUrls("https://spun.example.org/");
const RESOURCE = "https://spun.example.org/mcp";
// The example from RFC 7636 appendix B.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("oauthUrls and metadata", () => {
  it("builds every URL from the origin of AUTH_URL", () => {
    expect(oauthUrls("http://cms.example:48180/some/path")).toEqual({
      issuer: "http://cms.example:48180",
      resource: "http://cms.example:48180/mcp",
      resourceMetadata: "http://cms.example:48180/.well-known/oauth-protected-resource/mcp",
      authorization: "http://cms.example:48180/oauth/authorize",
      token: "http://cms.example:48180/oauth/token",
      registration: "http://cms.example:48180/oauth/register",
    });
  });

  it("names SPUN as the authorization server of /mcp", () => {
    expect(protectedResourceMetadata(urls)).toMatchObject({
      resource: RESOURCE,
      authorization_servers: ["https://spun.example.org"],
    });
  });

  it("offers S256 only, dynamic registration only, and iss in the response", () => {
    const metadata = authorizationServerMetadata(urls);
    expect(metadata).not.toHaveProperty("client_id_metadata_document_supported");
    expect(metadata).toMatchObject({
      issuer: "https://spun.example.org",
      code_challenge_methods_supported: ["S256"],
      registration_endpoint: "https://spun.example.org/oauth/register",
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe("PKCE S256", () => {
  it("computes the RFC 7636 example", () => {
    expect(s256(VERIFIER)).toBe(CHALLENGE);
  });

  it("matches the verifier to its challenge", () => {
    expect(pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("refuses another verifier, and verifiers of the wrong form", () => {
    expect(pkceMatches(`${VERIFIER.slice(0, -1)}3`, CHALLENGE)).toBe(false);
    expect(pkceMatches("short", s256("short"))).toBe(false);
    expect(pkceMatches(`${VERIFIER}!`, s256(`${VERIFIER}!`))).toBe(false);
    expect(pkceMatches("a".repeat(129), s256("a".repeat(129)))).toBe(false);
  });

  it("needs a challenge with the S256 method", () => {
    expect(checkChallenge(CHALLENGE, "S256")).toBeNull();
    expect(checkChallenge(CHALLENGE, "plain")?.code).toBe("oauth.pkce");
    expect(checkChallenge(CHALLENGE, undefined)?.code).toBe("oauth.pkce");
    expect(checkChallenge(undefined, "S256")?.code).toBe("oauth.pkce");
    expect(checkChallenge("too-short", "S256")?.code).toBe("oauth.pkce");
  });
});

describe("redirect URIs", () => {
  it("allows only http on loopback", () => {
    expect(checkRedirectUri("https://app.example.com/callback")).toBe(false);
    expect(checkRedirectUri("https://127.0.0.1/callback")).toBe(false);
    expect(checkRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(checkRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(checkRedirectUri("http://[::1]:8080/cb")).toBe(true);
    expect(checkRedirectUri("http://app.example.com/callback")).toBe(false);
    expect(checkRedirectUri("cursor://callback")).toBe(false);
    expect(checkRedirectUri("http://127.0.0.1/callback#x")).toBe(false);
    expect(checkRedirectUri("http://user:pw@127.0.0.1/callback")).toBe(false);
    expect(checkRedirectUri("not a url")).toBe(false);
  });

  it("matches a registered URI exactly", () => {
    const registered = ["http://127.0.0.1:3000/callback"];
    expect(redirectUriMatches(registered, "http://127.0.0.1:3000/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:3000/callback/")).toBe(false);
    expect(redirectUriMatches(registered, "http://127.0.0.1:3000/callback?x=1")).toBe(false);
    expect(redirectUriMatches(registered, "http://[::1]:3000/callback")).toBe(false);
    expect(redirectUriMatches(["https://app.example.com/callback"], "https://app.example.com/callback")).toBe(false);
  });

  it("lets only the port of a loopback URI differ", () => {
    const registered = ["http://127.0.0.1:3000/callback", "http://localhost/cb"];
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://localhost:9999/cb")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/other")).toBe(false);
    expect(redirectUriMatches(registered, "http://localhost:51234/callback")).toBe(false);
    expect(redirectUriMatches(registered, "https://127.0.0.1:3000/callback")).toBe(false);
  });
});

describe("resourceMatches", () => {
  it("accepts the MCP URL, with any case of scheme and host and a trailing slash", () => {
    expect(resourceMatches(RESOURCE, RESOURCE)).toBe(true);
    expect(resourceMatches("HTTPS://SPUN.Example.org/mcp", RESOURCE)).toBe(true);
    expect(resourceMatches("https://spun.example.org/mcp/", RESOURCE)).toBe(true);
    expect(resourceMatches("https://spun.example.org:443/mcp", RESOURCE)).toBe(true);
  });

  it("refuses any other resource, and none", () => {
    expect(resourceMatches(undefined, RESOURCE)).toBe(false);
    expect(resourceMatches("https://spun.example.org", RESOURCE)).toBe(false);
    expect(resourceMatches("https://spun.example.org/MCP", RESOURCE)).toBe(false);
    expect(resourceMatches("https://other.example.org/mcp", RESOURCE)).toBe(false);
    expect(resourceMatches("http://spun.example.org/mcp", RESOURCE)).toBe(false);
    expect(resourceMatches("https://spun.example.org/mcp#x", RESOURCE)).toBe(false);
    expect(resourceMatches("https://spun.example.org/mcp?x=1", RESOURCE)).toBe(false);
  });
});

describe("dynamic client registration", () => {
  it("registers a public client with its name and redirect URIs", () => {
    expect(
      parseRegistration({
        client_name: "Agent",
        redirect_uris: ["http://localhost:3000/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      }),
    ).toEqual({ ok: true, client: { name: "Agent", redirectUris: ["http://localhost:3000/callback"] } });
  });

  it("names a client with no name after its redirect host", () => {
    const result = parseRegistration({ redirect_uris: ["http://127.0.0.1:3000/cb"] });
    expect(result.ok && result.client.name).toBe("127.0.0.1:3000");
  });

  it("refuses missing, empty, too many and bad redirect URIs", () => {
    expect(parseRegistration({})).toMatchObject({ ok: false, error: { code: "oauth.clientMetadata" } });
    expect(parseRegistration({ redirect_uris: [] })).toMatchObject({ ok: false, error: { code: "oauth.clientMetadata" } });
    const many = Array.from({ length: OAUTH_REDIRECT_URIS_MAX + 1 }, (_, i) => `http://127.0.0.1/${i}`);
    expect(parseRegistration({ redirect_uris: many })).toMatchObject({
      ok: false,
      error: { code: "oauth.clientMetadata", max: OAUTH_REDIRECT_URIS_MAX },
    });
    expect(parseRegistration({ redirect_uris: ["https://app.example.com/cb"] })).toMatchObject({
      ok: false,
      error: { code: "oauth.badRedirectUri" },
    });
  });

  it("refuses grants and response types other than the code flow", () => {
    const redirect_uris = ["http://127.0.0.1/cb"];
    expect(parseRegistration({ redirect_uris, grant_types: ["client_credentials"] }).ok).toBe(false);
    expect(parseRegistration({ redirect_uris, grant_types: ["refresh_token"] }).ok).toBe(false);
    expect(parseRegistration({ redirect_uris, response_types: ["token"] }).ok).toBe(false);
  });

  it("cleans and cuts client names", () => {
    expect(cleanClientName("  My\tAgent\n\u0000 ")).toBe("My Agent");
    expect(cleanClientName("x".repeat(OAUTH_CLIENT_NAME_MAX + 10))).toHaveLength(OAUTH_CLIENT_NAME_MAX);
    expect(cleanClientName("   ")).toBeNull();
    expect(cleanClientName(42)).toBeNull();
  });
});

describe("signed client_id", () => {
  const key = Buffer.alloc(32, 7);
  const client = { name: "Desk Client \u00e9", redirectUris: ["http://127.0.0.1:3000/cb", "https://app.example/cb"] };
  const id = signClientId(key, client);

  it("round-trips the name and redirect URIs", () => {
    expect(id).toMatch(/^spunc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(readClientId(key, id)).toEqual(client);
  });

  it("reads a URL client_id as no client", () => {
    expect(readClientId(key, "https://client.example.com/oauth/client.json")).toBeNull();
  });

  it(`signs a registration whose client_id is at most ${OAUTH_CLIENT_ID_MAX} characters, and refuses a longer one`, () => {
    expect(OAUTH_CLIENT_ID_MAX).toBe(8 * 1024 - 3 * OAUTH_REDIRECT_URI_MAX - 1024);
    expect(signRegistration(key, client)).toEqual({ clientId: id });
    const uri = (n: number, length: number) => `http://127.0.0.1/${String(n).padEnd(length - 18, "x")}`;
    const fits = (count: number, length: number) => {
      const signed = signRegistration(key, { name: "A", redirectUris: Array.from({ length: count }, (_, n) => uri(n, length)) });
      return "clientId" in signed ? signed.clientId.length : signed;
    };
    expect(fits(2, OAUTH_REDIRECT_URI_MAX)).toBeLessThanOrEqual(OAUTH_CLIENT_ID_MAX);
    expect(fits(3, OAUTH_REDIRECT_URI_MAX)).toEqual({ error: { code: "oauth.clientTooLarge", max: OAUTH_CLIENT_ID_MAX } });
    expect(oauthError({ code: "oauth.clientTooLarge" })).toBe("invalid_client_metadata");
  });

  it("refuses a changed character anywhere", () => {
    for (let i = 0; i < id.length; i++) {
      const changed = `${id.slice(0, i)}${id[i] === "A" ? "B" : "A"}${id.slice(i + 1)}`;
      expect(readClientId(key, changed)).toBeNull();
    }
  });

  it("refuses another key, a truncated id and junk", () => {
    expect(readClientId(Buffer.alloc(32, 8), id)).toBeNull();
    expect(readClientId(key, id.slice(0, -1))).toBeNull();
    expect(readClientId(key, id.slice(0, id.lastIndexOf(".")))).toBeNull();
    expect(readClientId(key, id.slice(0, 20))).toBeNull();
    expect(readClientId(key, "")).toBeNull();
    expect(readClientId(key, "abcdefghij012345")).toBeNull();
    expect(readClientId(key, id.replace("spunc1.", "spunc2."))).toBeNull();
  });

  it("refuses a signed body that is not a name and a list of URIs", () => {
    const body = Buffer.from(JSON.stringify({ name: "x" })).toString("base64url");
    const mac = createHmac("sha256", key).update(`spunc1.${body}`).digest("base64url");
    expect(readClientId(key, `spunc1.${body}.${mac}`)).toBeNull();
  });
});

describe("authorization requests", () => {
  const client = { name: "Agent", redirectUris: ["http://127.0.0.1:3000/callback"] };
  const good = {
    responseType: "code",
    clientId: "abcdefghij012345",
    redirectUri: "http://127.0.0.1:3000/callback",
    state: "xyz",
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    resource: RESOURCE,
  };

  it("passes a good request", () => {
    expect(checkAuthorizeRequest(good, client, RESOURCE)).toEqual({ ok: true });
  });

  it("shows an unknown client or redirect URI on the page, never at the redirect URI", () => {
    expect(checkAuthorizeRequest(good, null, RESOURCE)).toMatchObject({ redirect: false, error: { code: "oauth.unknownClient" } });
    expect(checkAuthorizeRequest({ ...good, redirectUri: "https://evil.example/cb" }, client, RESOURCE)).toMatchObject({
      redirect: false,
      error: { code: "oauth.redirectUri" },
    });
    expect(checkAuthorizeRequest({ ...good, redirectUri: undefined }, client, RESOURCE)).toMatchObject({ redirect: false });
  });

  it("sends other errors to the redirect URI", () => {
    expect(checkAuthorizeRequest({ ...good, responseType: "token" }, client, RESOURCE)).toMatchObject({
      redirect: true,
      error: { code: "oauth.responseType" },
    });
    expect(checkAuthorizeRequest({ ...good, codeChallengeMethod: "plain" }, client, RESOURCE)).toMatchObject({
      redirect: true,
      error: { code: "oauth.pkce" },
    });
    expect(checkAuthorizeRequest({ ...good, resource: undefined }, client, RESOURCE)).toMatchObject({
      redirect: true,
      error: { code: "oauth.resource" },
    });
    expect(checkAuthorizeRequest({ ...good, resource: "https://other.example/mcp" }, client, RESOURCE)).toMatchObject({
      redirect: true,
      error: { code: "oauth.resource" },
    });
  });

  it("refuses a parameter given twice, and keeps the parameters through a form", () => {
    expect(parseAuthorizeParams({ client_id: ["a", "b"] })).toBeNull();
    const params = parseAuthorizeParams({
      response_type: "code",
      client_id: good.clientId,
      redirect_uri: good.redirectUri,
      state: "xyz",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      resource: RESOURCE,
      scope: "ignored",
    });
    expect(params).toEqual(good);
    expect(parseAuthorizeParams(Object.fromEntries(new URLSearchParams(authorizeQuery(good))))).toEqual(good);
  });

  it("adds the response to the redirect URI, keeping its query", () => {
    const url = new URL(responseUrl("https://app.example.com/cb?a=1", { code: "c", state: undefined, iss: urls.issuer }));
    expect(url.searchParams.get("a")).toBe("1");
    expect(url.searchParams.get("code")).toBe("c");
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("iss")).toBe("https://spun.example.org");
  });
});

describe("token requests", () => {
  const code: CodeGrant = {
    userId: "user-1",
    clientId: "abcdefghij012345",
    clientName: "Agent",
    redirectUri: "http://127.0.0.1:3000/callback",
    codeChallenge: CHALLENGE,
  };
  const exchange = {
    grant_type: "authorization_code",
    code: "the-code",
    client_id: code.clientId,
    redirect_uri: code.redirectUri,
    code_verifier: VERIFIER,
    resource: RESOURCE,
  };

  it("exchanges a code with its verifier", () => {
    expect(checkCodeExchange(code, exchange, RESOURCE)).toBeNull();
    const bare: Record<string, string> = { ...exchange };
    delete bare.redirect_uri;
    delete bare.resource;
    expect(checkCodeExchange(code, bare, RESOURCE)).toBeNull();
  });

  it("refuses a code that is used, unknown or expired: the store no longer has it", () => {
    expect(checkCodeExchange(null, exchange, RESOURCE)?.code).toBe("oauth.badGrant");
  });

  it("refuses a wrong verifier, client or redirect URI", () => {
    expect(checkCodeExchange(code, { ...exchange, code_verifier: "x".repeat(43) }, RESOURCE)?.code).toBe("oauth.badGrant");
    expect(checkCodeExchange(code, { ...exchange, client_id: "other" }, RESOURCE)?.code).toBe("oauth.badGrant");
    expect(checkCodeExchange(code, { ...exchange, redirect_uri: "http://127.0.0.1:3000/x" }, RESOURCE)?.code).toBe(
      "oauth.badGrant",
    );
    const noVerifier: Record<string, string> = { ...exchange };
    delete noVerifier.code_verifier;
    expect(checkCodeExchange(code, noVerifier, RESOURCE)?.code).toBe("oauth.pkce");
  });

  it("refuses another resource", () => {
    expect(checkCodeExchange(code, { ...exchange, resource: "https://other.example/mcp" }, RESOURCE)?.code).toBe(
      "oauth.resource",
    );
  });

  const now = new Date(Date.UTC(2026, 10, 13, 12));
  const grant = { clientIdHash: tokenHash(code.clientId), deletedAt: null, refreshExpiresAt: new Date(now.getTime() + 1000) };
  const refresh = { grant_type: "refresh_token", refresh_token: "t", client_id: code.clientId };

  it("refreshes a live grant", () => {
    expect(checkRefresh(grant, refresh, RESOURCE, now)).toBeNull();
    expect(checkRefresh(grant, { ...refresh, resource: RESOURCE }, RESOURCE, now)).toBeNull();
  });

  it("refuses a revoked grant", () => {
    expect(checkRefresh({ ...grant, deletedAt: now }, refresh, RESOURCE, now)?.code).toBe("oauth.badGrant");
  });

  it("refuses an expired, unknown or rotated refresh token, and another client", () => {
    expect(checkRefresh({ ...grant, refreshExpiresAt: now }, refresh, RESOURCE, now)?.code).toBe("oauth.badGrant");
    expect(checkRefresh(null, refresh, RESOURCE, now)?.code).toBe("oauth.badGrant");
    expect(checkRefresh(grant, { ...refresh, client_id: "other" }, RESOURCE, now)?.code).toBe("oauth.badGrant");
    expect(checkRefresh(grant, { ...refresh, client_id: undefined as unknown as string }, RESOURCE, now)?.code).toBe(
      "oauth.badGrant",
    );
    expect(checkRefresh(grant, { ...refresh, resource: "https://x.example/mcp" }, RESOURCE, now)?.code).toBe(
      "oauth.resource",
    );
  });

  it("refuses a form with a parameter given twice", () => {
    expect(parseFormBody("grant_type=refresh_token&refresh_token=a")).toEqual({
      grant_type: "refresh_token",
      refresh_token: "a",
    });
    expect(parseFormBody("code=a&code=b")).toBeNull();
  });

  it("names the OAuth error of each problem", () => {
    expect(oauthError({ code: "oauth.badGrant" })).toBe("invalid_grant");
    expect(oauthError({ code: "oauth.resource" })).toBe("invalid_target");
    expect(oauthError({ code: "oauth.grantType" })).toBe("unsupported_grant_type");
    expect(oauthError({ code: "oauth.unknownClient" })).toBe("invalid_client");
    expect(oauthError({ code: "oauth.badRedirectUri" })).toBe("invalid_redirect_uri");
  });
});
