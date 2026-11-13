import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { connectMcpClient, MCP_URL } from "../support/oauth";
import { accounts, settings } from "../support/settings";
import { MCP_TOOL_OF_ROUTE } from "../../src/lib/mcptext";

// Every route under src/app/api with the methods its file exports, in the form /api.md uses.
// The doc's wording and layout can change; a route missing from it fails the test.
function apiRoutes(dir = path.join(__dirname, "..", "..", "src", "app", "api"), url = "/api"): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (url === "/api" && entry.name === "auth") continue;
      const part = entry.name.replace(/^\[(.+)\]$/, "{$1}");
      routes.push(...apiRoutes(path.join(dir, entry.name), `${url}/${part}`));
    } else if (entry.name === "route.ts") {
      const source = readFileSync(path.join(dir, entry.name), "utf8");
      for (const [, method] of source.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
        routes.push(`${method} ${url}`);
      }
    }
  }
  return routes;
}

test("/api.md is served, describes every API route, and /llms.txt links to it", async ({ page }) => {
  const api = await page.request.get("/api.md");
  expect(api.status()).toBe(200);
  expect(api.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  const text = await api.text();
  for (const header of ["X-SPUN-Key", "X-SPUN-Timestamp", "X-SPUN-Nonce", "X-SPUN-Signature"]) {
    expect(text).toContain(header);
  }
  const routes = apiRoutes();
  expect(routes).toContain("GET /api/apps");
  for (const route of routes) {
    expect(text, route).toContain(route);
  }

  const llms = await (await page.request.get("/llms.txt")).text();
  expect(llms).toContain("](/api.md)");
});

test("every API route and method has an MCP tool that /mcp serves", async ({ browser }) => {
  const routes = apiRoutes();
  expect(Object.keys(MCP_TOOL_OF_ROUTE).sort()).toEqual([...routes].sort());

  const context = await browser.newContext({ storageState: accounts.client.storageState });
  const client = new Client({ name: "spun-e2e", version: "1.0.0" });
  try {
    const { accessToken } = await connectMcpClient(await context.newPage(), `E2E MCP parity ${Date.now().toString(36)}`);
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: { token: async () => accessToken } }));
    const served = (await client.listTools()).tools.map((tool) => tool.name);
    for (const route of routes) {
      expect(served, route).toContain(MCP_TOOL_OF_ROUTE[route]);
    }
  } finally {
    await client.close();
    await context.close();
  }
});

test("an API call without a key is refused with JSON", async ({ page }) => {
  const response = await page.request.get("/api/apps");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: { code: "api.missingHeader" } });
});

// Playwright always sends Content-Length, so this request goes through node:http.
test("a chunked body without Content-Length is refused with 411, on a GET too", async () => {
  const url = new URL("/api/apps", settings.baseUrl);
  const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.request(url, { method: "GET", headers: { "Transfer-Encoding": "chunked" } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.on("error", reject);
    request.end("x");
  });
  expect(status).toBe(411);
  expect(JSON.parse(body)).toEqual({ error: { code: "api.lengthRequired" } });
});
