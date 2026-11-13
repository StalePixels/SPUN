import { createHash, randomBytes } from "node:crypto";
import type { APIResponse, Page } from "@playwright/test";
import { grantRowsOfClient, setGrantRefreshExpiry, userByUsername } from "../support/db";
import { clickHydrated, expect, test } from "../support/pages";
import { accounts, settings } from "../support/settings";

// The client's redirect URI is on loopback, where nothing listens: the test
// answers it in the browser and reads the code from the URL.
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const ORIGIN = new URL(settings.baseUrl).origin;
const RESOURCE = `${ORIGIN}/mcp`;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function expectOAuthError(response: APIResponse, status: number, error: string): Promise<void> {
  expect(response.status(), error).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual(expect.objectContaining({ error }));
}

function authorizeUrl(clientId: string, challenge: string, state: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
    ...extra,
  });
  return `/oauth/authorize?${params}`;
}

// Registers a client and allows it, and gives the code and the token request that exchanges it.
async function allowedCode(page: Page, name: string) {
  const registered = await page.request.post("/oauth/register", { data: { client_name: name, redirect_uris: [REDIRECT_URI] } });
  expect(registered.status()).toBe(201);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const { verifier, challenge } = pkce();
  await page.goto(authorizeUrl(clientId, challenge, "s"));
  const allowed = await catchRedirect(page, "oauth-allow");
  const exchange = {
    grant_type: "authorization_code",
    code: allowed.searchParams.get("code") ?? "",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: RESOURCE,
  };
  return { clientId, exchange };
}

type Tokens = { access_token: string; refresh_token: string };

async function mcpStatus(page: Page, accessToken: string): Promise<number> {
  const response = await page.request.post("/mcp", {
    headers: { Accept: "application/json, text/event-stream", Authorization: `Bearer ${accessToken}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  return response.status();
}

// Answers every request to the client's redirect URI, and returns the URL the browser was sent to.
async function catchRedirect(page: Page, decision: "oauth-allow" | "oauth-deny"): Promise<URL> {
  const sent = page.waitForRequest((request) => request.url().startsWith(REDIRECT_URI));
  await clickHydrated(page.getByTestId(decision));
  return new URL((await sent).url());
}

test.beforeEach(async ({ page }) => {
  await page.route(`http://127.0.0.1:${REDIRECT_PORT}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "client callback" }),
  );
});

test("an MCP client registers, the user allows it, and its tokens work until the user disconnects it", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);

  const resourceMetadata = await page.request.get("/.well-known/oauth-protected-resource/mcp");
  expect(resourceMetadata.status()).toBe(200);
  expect(await resourceMetadata.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN] });
  expect((await page.request.get("/.well-known/oauth-protected-resource")).status()).toBe(404);
  const server = await page.request.get("/.well-known/oauth-authorization-server");
  expect(server.status()).toBe(200);
  const metadata = (await server.json()) as Record<string, unknown>;
  expect(metadata).toMatchObject({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  });
  expect(metadata).not.toHaveProperty("client_id_metadata_document_supported");

  const name = `E2E MCP ${Date.now().toString(36)}`;
  const registered = await page.request.post("/oauth/register", {
    data: { client_name: name, redirect_uris: [REDIRECT_URI], application_type: "native", token_endpoint_auth_method: "none" },
  });
  expect(registered.status()).toBe(201);
  const registration = (await registered.json()) as { client_id: string; token_endpoint_auth_method: string };
  const clientId = registration.client_id;
  expect(registration.token_endpoint_auth_method).toBe("none");
  expect(clientId).toMatch(/^spunc1\./);

  const { verifier, challenge } = pkce();
  const state = randomBytes(8).toString("hex");
  await page.goto(authorizeUrl(clientId, challenge, state));
  await expect(page.getByTestId("oauth-client-name")).toHaveText(name);
  await expect(page.getByTestId("oauth-redirect-host")).toHaveText(`127.0.0.1:${REDIRECT_PORT}`);
  await expect(page.getByTestId("oauth-local-warning")).toBeVisible();
  const allowed = await catchRedirect(page, "oauth-allow");
  expect(allowed.searchParams.get("state")).toBe(state);
  expect(allowed.searchParams.get("iss")).toBe(ORIGIN);
  const code = allowed.searchParams.get("code") ?? "";
  expect(code).not.toBe("");

  const exchange = {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: RESOURCE,
  };
  const exchanged = await page.request.post("/oauth/token", { form: exchange });
  expect(exchanged.status()).toBe(200);
  expect(exchanged.headers()["cache-control"]).toContain("no-store");
  const first = (await exchanged.json()) as { access_token: string; refresh_token: string; token_type: string; expires_in: number };
  expect(first).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  const [grant] = await grantRowsOfClient(clientId);
  expect(grant).toMatchObject({
    user_id: client.id,
    client_id_hash: sha256(clientId),
    client_name: name,
    deleted_at: null,
    access_hash: sha256(first.access_token),
    refresh_hash: sha256(first.refresh_token),
    previous_refresh_hash: null,
  });

  const refresh = { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId, resource: RESOURCE };
  const refreshed = await page.request.post("/oauth/token", { form: refresh });
  expect(refreshed.status()).toBe(200);
  const second = (await refreshed.json()) as { access_token: string; refresh_token: string };
  expect(second.access_token).not.toBe(first.access_token);
  expect(second.refresh_token).not.toBe(first.refresh_token);
  expect((await grantRowsOfClient(clientId))[0]).toMatchObject({
    access_hash: sha256(second.access_token),
    refresh_hash: sha256(second.refresh_token),
    previous_refresh_hash: sha256(first.refresh_token),
    deleted_at: null,
  });

  await page.goto("/me/keys");
  const row = page.getByTestId(`grant-${grant.id}`);
  await expect(row.getByTestId("grant-name")).toHaveText(name);
  await clickHydrated(row.getByTestId("revoke-grant"));
  await page.getByTestId("revoke-grant-confirm").click();
  await expect(row).toHaveCount(0);
  expect((await grantRowsOfClient(clientId))[0].deleted_at).not.toBeNull();

  await expectOAuthError(
    await page.request.post("/oauth/token", { form: { ...refresh, refresh_token: second.refresh_token } }),
    400,
    "invalid_grant",
  );
});

test("a denied request, a wrong redirect URI and a wrong verifier get no tokens", async ({ page }) => {
  const registered = await page.request.post("/oauth/register", {
    data: { client_name: "E2E MCP refusals", redirect_uris: [REDIRECT_URI] },
  });
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const { verifier, challenge } = pkce();

  await page.goto(authorizeUrl(clientId, challenge, "s1", { redirect_uri: "https://evil.example/callback" }));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "oauth.redirectUri");
  await expect(page.getByTestId("oauth-allow")).toHaveCount(0);

  await page.goto(authorizeUrl("unknownclient000", challenge, "s1"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "oauth.unknownClient");
  const forged = `${clientId.slice(0, -1)}${clientId.endsWith("A") ? "B" : "A"}`;
  await page.goto(authorizeUrl(forged, challenge, "s1"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "oauth.unknownClient");

  const sent = page.waitForRequest((request) => request.url().startsWith(REDIRECT_URI));
  await page.goto(authorizeUrl(clientId, challenge, "s2", { resource: "https://other.example/mcp" })).catch(() => {});
  const wrongResource = new URL((await sent).url());
  expect(wrongResource.searchParams.get("error")).toBe("invalid_target");
  expect(wrongResource.searchParams.get("state")).toBe("s2");

  await page.goto(authorizeUrl(clientId, challenge, "s3"));
  const denied = await catchRedirect(page, "oauth-deny");
  expect(denied.searchParams.get("error")).toBe("access_denied");
  expect(denied.searchParams.get("state")).toBe("s3");
  expect(denied.searchParams.get("iss")).toBe(ORIGIN);
  expect(denied.searchParams.has("code")).toBe(false);

  await page.goto(authorizeUrl(clientId, challenge, "s4"));
  const allowed = await catchRedirect(page, "oauth-allow");
  const exchange = {
    grant_type: "authorization_code",
    code: allowed.searchParams.get("code") ?? "",
    client_id: clientId,
    code_verifier: `${verifier.slice(0, -1)}${verifier.endsWith("A") ? "B" : "A"}`,
  };
  await expectOAuthError(await page.request.post("/oauth/token", { form: exchange }), 400, "invalid_grant");
  await expectOAuthError(
    await page.request.post("/oauth/token", { form: { ...exchange, code_verifier: verifier } }),
    400,
    "invalid_grant",
  );
  expect(await grantRowsOfClient(clientId)).toEqual([]);

  for (const uri of ["http://evil.example/callback", "https://app.example/callback", "https://127.0.0.1/callback"]) {
    await expectOAuthError(await page.request.post("/oauth/register", { data: { redirect_uris: [uri] } }), 400, "invalid_redirect_uri");
  }
});

test("a code used a second time revokes the grant it made", async ({ page }) => {
  const { clientId, exchange } = await allowedCode(page, "E2E MCP code reuse");
  const exchanged = await page.request.post("/oauth/token", { form: exchange });
  expect(exchanged.status()).toBe(200);
  const tokens = (await exchanged.json()) as Tokens;
  expect(await mcpStatus(page, tokens.access_token)).toBe(200);

  await expectOAuthError(await page.request.post("/oauth/token", { form: exchange }), 400, "invalid_grant");
  const [grant] = await grantRowsOfClient(clientId);
  expect(grant.deleted_at).not.toBeNull();
  expect(await mcpStatus(page, tokens.access_token)).toBe(401);
  await expectOAuthError(
    await page.request.post("/oauth/token", {
      form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId },
    }),
    400,
    "invalid_grant",
  );
});

test("two exchanges of one code at once leave no working grant", async ({ page }) => {
  const { clientId, exchange } = await allowedCode(page, "E2E MCP code race");
  const answers = await Promise.all([0, 1].map(() => page.request.post("/oauth/token", { form: exchange })));
  const statuses = answers.map((answer) => answer.status()).sort();
  expect([[200, 400], [400, 400]]).toContainEqual(statuses);
  for (const answer of answers.filter((one) => one.status() === 200)) {
    expect(await mcpStatus(page, ((await answer.json()) as Tokens).access_token)).toBe(401);
  }
  for (const grant of await grantRowsOfClient(clientId)) {
    expect(grant.deleted_at).not.toBeNull();
  }
});

test("a refresh token used a second time revokes the grant", async ({ page }) => {
  const { clientId, exchange } = await allowedCode(page, "E2E MCP refresh reuse");
  const first = (await (await page.request.post("/oauth/token", { form: exchange })).json()) as Tokens;
  const refresh = { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId, resource: RESOURCE };
  const refreshed = await page.request.post("/oauth/token", { form: refresh });
  expect(refreshed.status()).toBe(200);
  const second = (await refreshed.json()) as Tokens;
  expect(await mcpStatus(page, second.access_token)).toBe(200);

  await expectOAuthError(await page.request.post("/oauth/token", { form: refresh }), 400, "invalid_grant");
  expect((await grantRowsOfClient(clientId))[0].deleted_at).not.toBeNull();
  expect(await mcpStatus(page, second.access_token)).toBe(401);
  await expectOAuthError(
    await page.request.post("/oauth/token", { form: { ...refresh, refresh_token: second.refresh_token } }),
    400,
    "invalid_grant",
  );
});

test("two refreshes with one refresh token at once give tokens once, and revoke the grant", async ({ page }) => {
  const { clientId, exchange } = await allowedCode(page, "E2E MCP refresh race");
  const first = (await (await page.request.post("/oauth/token", { form: exchange })).json()) as Tokens;
  const refresh = { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId, resource: RESOURCE };
  const answers = await Promise.all([0, 1].map(() => page.request.post("/oauth/token", { form: refresh })));
  expect(answers.map((answer) => answer.status()).sort()).toEqual([200, 400]);
  const winner = answers.find((answer) => answer.status() === 200);
  const tokens = (await winner?.json()) as Tokens;
  expect((await grantRowsOfClient(clientId))[0].deleted_at).not.toBeNull();
  expect(await mcpStatus(page, tokens.access_token)).toBe(401);
});

test("a client_id that is a URL is an unknown client", async ({ page }) => {
  const { challenge } = pkce();
  await page.goto(authorizeUrl("https://client.example.com/oauth/client.json", challenge, "s1"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "oauth.unknownClient");
  await expect(page.getByTestId("oauth-allow")).toHaveCount(0);
});

test("the token and registration endpoints refuse a body of the wrong type", async ({ page }) => {
  await expectOAuthError(
    await page.request.post("/oauth/token", { data: { grant_type: "refresh_token", refresh_token: "x", client_id: "y" } }),
    400,
    "invalid_request",
  );
  await expectOAuthError(
    await page.request.post("/oauth/register", { form: { redirect_uris: REDIRECT_URI } }),
    400,
    "invalid_request",
  );
  const typed = await page.request.post("/oauth/register", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    data: JSON.stringify({ client_name: "E2E MCP charset", redirect_uris: [REDIRECT_URI] }),
  });
  expect(typed.status()).toBe(201);
});

test("registration refuses a client whose client_id would not fit in an authorize request line", async ({ page }) => {
  const uri = (n: number) => `http://127.0.0.1:${REDIRECT_PORT}/${String(n).padEnd(1000, "x")}`;
  await expectOAuthError(
    await page.request.post("/oauth/register", { data: { redirect_uris: [uri(1), uri(2), uri(3)] } }),
    400,
    "invalid_client_metadata",
  );
  const fits = await page.request.post("/oauth/register", { data: { redirect_uris: [uri(1), uri(2)] } });
  expect(fits.status()).toBe(201);
  const { client_id: clientId } = (await fits.json()) as { client_id: string };
  const { challenge } = pkce();
  const url = authorizeUrl(clientId, challenge, "s".repeat(128), { redirect_uri: uri(2) });
  expect(`GET ${url} HTTP/1.1\r\n`.length).toBeLessThanOrEqual(8 * 1024);
  await page.goto(url);
  await expect(page.getByTestId("oauth-allow")).toBeVisible();
});

test("/me/keys does not list a client whose refresh token has expired", async ({ page }) => {
  const name = `E2E MCP expired ${Date.now().toString(36)}`;
  const { clientId, exchange } = await allowedCode(page, name);
  expect((await page.request.post("/oauth/token", { form: exchange })).status()).toBe(200);
  const [grant] = await grantRowsOfClient(clientId);
  await page.goto("/me/keys");
  await expect(page.getByTestId(`grant-${grant.id}`)).toHaveCount(1);
  await setGrantRefreshExpiry(grant.id, new Date(Date.now() - 1000));
  await page.reload();
  await expect(page.getByTestId(`grant-${grant.id}`)).toHaveCount(0);
});
