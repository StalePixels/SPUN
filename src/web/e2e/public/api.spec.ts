import http from "node:http";
import { expect, test } from "@playwright/test";
import { settings } from "../support/settings";

test("/api.md is served, and /llms.txt links to it", async ({ page }) => {
  const api = await page.request.get("/api.md");
  expect(api.status()).toBe(200);
  expect(api.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  const text = await api.text();
  expect(text.startsWith("# SPUN API\n")).toBe(true);
  for (const header of ["X-SPUN-Key", "X-SPUN-Timestamp", "X-SPUN-Nonce", "X-SPUN-Signature"]) {
    expect(text).toContain(header);
  }
  expect(text).toContain("### GET /api/apps");

  const llms = await (await page.request.get("/llms.txt")).text();
  expect(llms).toContain("](/api.md)");
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
