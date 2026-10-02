import { createHmac, randomBytes } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";

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
  return request.fetch(path, { method, headers, data: options.data });
}
