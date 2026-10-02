import {
  isNonce,
  isSignature,
  keySecret,
  parseKeyId,
  parseTimestamp,
  signatureMatches,
  signedText,
  sign,
  timestampInWindow,
} from "./keys";
import type { Problem } from "./problems";
import {
  API_IP_PER_MINUTE,
  API_JSON_BODY_MAX,
  API_KEY_PER_MINUTE,
  API_RELEASE_BODY_MAX,
  API_REQUEST_WINDOW_SECONDS,
  API_SCREENSHOT_BODY_MAX,
  API_UPLOADS_PER_HOUR,
} from "./rules";

export type ApiLimits = {
  jsonBody: number;
  releaseBody: number;
  screenshotBody: number;
  ipPerMinute: number;
  keyPerMinute: number;
  uploadsPerHour: number;
};

export type BodyKind = "json" | "release" | "screenshot";

export type ApiOptions = { body: BodyKind; upload?: boolean };

export type ApiCall = {
  method: string;
  pathWithQuery: string;
  ip: string;
  header(name: string): string | null;
};

export type ApiUser = { id: string; username: string };

export type ApiDeps = {
  nowMs(): number;
  serverKey(): string;
  limits: ApiLimits;
  findKeyUser(keyId: string): Promise<ApiUser | null>;
  claimOnce(name: string, ttlSeconds: number): Promise<boolean>;
  count(name: string, ttlSeconds: number): Promise<number>;
};

export type ApiRefusal = { status: number; error: Problem; retryAfter?: number };

export type GateResult = { ok: true; user: ApiUser } | ({ ok: false } & ApiRefusal);

function limitFrom(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const value = env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be a whole number. See .env.example.`);
  }
  return Number(value);
}

export function apiLimits(env: Record<string, string | undefined> = process.env): ApiLimits {
  return {
    jsonBody: limitFrom(env, "API_JSON_BODY_MAX", API_JSON_BODY_MAX),
    releaseBody: limitFrom(env, "API_RELEASE_BODY_MAX", API_RELEASE_BODY_MAX),
    screenshotBody: limitFrom(env, "API_SCREENSHOT_BODY_MAX", API_SCREENSHOT_BODY_MAX),
    ipPerMinute: limitFrom(env, "API_IP_PER_MINUTE", API_IP_PER_MINUTE),
    keyPerMinute: limitFrom(env, "API_KEY_PER_MINUTE", API_KEY_PER_MINUTE),
    uploadsPerHour: limitFrom(env, "API_UPLOADS_PER_HOUR", API_UPLOADS_PER_HOUR),
  };
}

function bodyLimit(limits: ApiLimits, kind: BodyKind): number {
  return { json: limits.jsonBody, release: limits.releaseBody, screenshot: limits.screenshotBody }[kind];
}

function refuse(status: number, error: Problem, retryAfter?: number): GateResult {
  return retryAfter === undefined ? { ok: false, status, error } : { ok: false, status, error, retryAfter };
}

export async function rateCheck(
  deps: ApiDeps,
  name: string,
  limit: number,
  windowSeconds: number,
): Promise<number | null> {
  const now = deps.nowMs() / 1000;
  const window = Math.floor(now / windowSeconds);
  const left = Math.max(1, Math.ceil((window + 1) * windowSeconds - now));
  const n = await deps.count(`rate:${name}:${window}`, left);
  return n > limit ? left : null;
}

// A chunked body has no Content-Length, on any method, so its size cannot be checked before it is read.
function checkSize(call: ApiCall, options: ApiOptions, limits: ApiLimits): GateResult | null {
  const length = call.header("content-length");
  if (length === null) {
    return ["POST", "PUT"].includes(call.method.toUpperCase()) || call.header("transfer-encoding") !== null
      ? refuse(411, { code: "api.lengthRequired" })
      : null;
  }
  const max = bodyLimit(limits, options.body);
  return Number(length) > max ? refuse(413, { code: "api.bodyTooLarge", max }) : null;
}

// A nonce is held until its timestamp leaves the window; after that the request is refused anyway.
async function checkSignature(call: ApiCall, deps: ApiDeps): Promise<GateResult> {
  const keyId = call.header("x-spun-key");
  const timestampText = call.header("x-spun-timestamp");
  const nonce = call.header("x-spun-nonce");
  const signature = call.header("x-spun-signature");
  const timestamp = timestampText === null ? null : parseTimestamp(timestampText);
  if (
    keyId === null ||
    timestampText === null ||
    timestamp === null ||
    nonce === null ||
    !isNonce(nonce) ||
    signature === null ||
    !isSignature(signature)
  ) {
    return refuse(401, { code: "api.missingHeader" });
  }
  const nowSeconds = Math.floor(deps.nowMs() / 1000);
  if (!timestampInWindow(timestamp, nowSeconds)) {
    return refuse(401, { code: "api.oldRequest" });
  }
  const user = parseKeyId(keyId) ? await deps.findKeyUser(keyId) : null;
  if (!user) {
    return refuse(401, { code: "api.badKey" });
  }
  const text = signedText(call.method, call.pathWithQuery, timestampText, nonce);
  if (!signatureMatches(sign(keySecret(deps.serverKey(), keyId), text), signature)) {
    return refuse(401, { code: "api.badSignature" });
  }
  const ttl = Math.max(1, Math.ceil(timestamp + API_REQUEST_WINDOW_SECONDS - nowSeconds) + 1);
  if (!(await deps.claimOnce(`nonce:${keyId}:${nonce}`, ttl))) {
    return refuse(401, { code: "api.nonceUsed" });
  }
  return { ok: true, user };
}

export async function checkApiCall(call: ApiCall, options: ApiOptions, deps: ApiDeps): Promise<GateResult> {
  const size = checkSize(call, options, deps.limits);
  if (size) {
    return size;
  }
  const ipWait = await rateCheck(deps, `ip:${call.ip}`, deps.limits.ipPerMinute, 60);
  if (ipWait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, ipWait);
  }
  const signed = await checkSignature(call, deps);
  if (!signed.ok) {
    return signed;
  }
  const keyId = call.header("x-spun-key") ?? "";
  const keyWait = await rateCheck(deps, `key:${keyId}`, deps.limits.keyPerMinute, 60);
  if (keyWait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, keyWait);
  }
  if (options.upload) {
    const uploadWait = await rateCheck(deps, `upload:${keyId}`, deps.limits.uploadsPerHour, 3600);
    if (uploadWait !== null) {
      return refuse(429, { code: "api.tooManyRequests" }, uploadWait);
    }
  }
  return signed;
}
