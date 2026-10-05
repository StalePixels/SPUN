import { createHmac, randomBytes } from "node:crypto";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { clickHydrated } from "./pages";

// Signs API requests as /api.md tells an agent to.

export type ApiKey = { keyId: string; secret: string };

export function splitKey(key: string): ApiKey {
  const match = /^nbnspun-([0-9a-z]{16})-([0-9a-f]{64})$/.exec(key);
  if (!match) throw new Error(`Not an API key: ${key}`);
  return { keyId: match[1], secret: match[2] };
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export type SignedOptions = {
  method?: string;
  timestamp?: number;
  nonce?: string;
  // Signs with this secret instead of the key's.
  secret?: string;
  // Leaves this header out.
  omit?: string;
  data?: Buffer | string;
  multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;
};

export async function signedFetch(
  request: APIRequestContext,
  key: ApiKey,
  path: string,
  options: SignedOptions = {},
): Promise<APIResponse> {
  const method = options.method ?? "GET";
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = options.nonce ?? newNonce();
  const text = [method, path, timestamp, nonce].join("\n");
  const signature = createHmac("sha256", options.secret ?? key.secret).update(text).digest("hex");
  const headers: Record<string, string> = {
    "X-SPUN-Key": key.keyId,
    "X-SPUN-Timestamp": timestamp,
    "X-SPUN-Nonce": nonce,
    "X-SPUN-Signature": signature,
  };
  if (options.omit) delete headers[options.omit];
  return request.fetch(path, { method, headers, data: options.data, multipart: options.multipart });
}

// Makes a key on /me/keys as the page's logged-in user.
export async function makeApiKey(page: Page): Promise<ApiKey> {
  await page.goto("/me/keys");
  await page.getByTestId("key-name-field").fill(`E2E key ${Date.now().toString(36)}`);
  await clickHydrated(page.getByTestId("key-submit"));
  return splitKey(((await page.getByTestId("key-secret").textContent()) ?? "").trim());
}

export async function signedJson(
  request: APIRequestContext,
  key: ApiKey,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await signedFetch(request, key, path, {
    method,
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}
