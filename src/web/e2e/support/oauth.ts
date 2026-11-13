import { createHash, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { clickHydrated, expect } from "./pages";
import { settings } from "./settings";

export const ORIGIN = new URL(settings.baseUrl).origin;
export const MCP_URL = `${ORIGIN}/mcp`;
export const RESOURCE_METADATA = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;

// Nothing listens on the redirect URI: the browser's request to it is answered
// by the test, which reads the code from the URL.
const REDIRECT_PORT = 53683;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

export type McpConnection = { clientId: string; accessToken: string; refreshToken: string };

// Registers a client, allows it as the page's logged-in user, and exchanges the code for tokens.
export async function connectMcpClient(page: Page, name: string): Promise<McpConnection> {
  const callback = `http://127.0.0.1:${REDIRECT_PORT}/**`;
  await page.route(callback, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "client callback" }));
  try {
    const registered = await page.request.post("/oauth/register", {
      data: { client_name: name, redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "none" },
    });
    expect(registered.status()).toBe(201);
    const { client_id: clientId } = (await registered.json()) as { client_id: string };

    const verifier = randomBytes(32).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state: "e2e",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: MCP_URL,
    });
    await page.goto(`/oauth/authorize?${params}`);
    const sent = page.waitForRequest((request) => request.url().startsWith(REDIRECT_URI));
    await clickHydrated(page.getByTestId("oauth-allow"));
    const code = new URL((await sent).url()).searchParams.get("code") ?? "";

    const exchanged = await page.request.post("/oauth/token", {
      form: {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        resource: MCP_URL,
      },
    });
    expect(exchanged.status()).toBe(200);
    const tokens = (await exchanged.json()) as { access_token: string; refresh_token: string };
    return { clientId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  } finally {
    await page.unroute(callback);
  }
}
