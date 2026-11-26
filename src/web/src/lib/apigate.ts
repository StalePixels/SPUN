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
  API_REQUEST_WINDOW_SECONDS,
  API_SCREENSHOT_BODY_MAX,
  mustAcceptTerms,
  releaseBodyMax,
  UPLOAD_LIMIT_MB_MAX,
  uploadLimitBytes,
  UPLOADS_PER_HOUR,
} from "./rules";

export type ApiLimits = {
  jsonBody: number;
  // Null: each user's release body limit comes from their zip limit alone.
  releaseBody: number | null;
  screenshotBody: number;
  ipPerMinute: number;
  keyPerMinute: number;
  uploadsPerHour: number;
};

export type BodyKind = "json" | "release" | "screenshot";

export type ApiOptions = { body: BodyKind };

export type ApiCall = {
  method: string;
  pathWithQuery: string;
  ip: string;
  header(name: string): string | null;
};

export type ApiUser = { id: string; username: string };

export type ApiKeyUser = ApiUser & {
  acceptedTermsId: number | null;
  uploadLimitMb: number | null;
  requestsPerMinute: number | null;
};

export type ApiDeps = {
  nowMs(): number;
  serverKey(): string;
  limits: ApiLimits;
  findKeyUser(keyId: string): Promise<ApiKeyUser | null>;
  currentTermsId(): Promise<number | null>;
  claimOnce(name: string, ttlSeconds: number): Promise<boolean>;
  count(name: string, ttlSeconds: number, hits?: number): Promise<number>;
};

export type ApiRefusal = { status: number; error: Problem; retryAfter?: number };

export type GateResult = { ok: true; user: ApiUser } | ({ ok: false } & ApiRefusal);

type SignedResult = { ok: true; user: ApiKeyUser } | ({ ok: false } & ApiRefusal);

function limitFrom(env: Record<string, string | undefined>, name: string, fallback: number): number {
  return optionalLimitFrom(env, name) ?? fallback;
}

function optionalLimitFrom(env: Record<string, string | undefined>, name: string): number | null {
  const value = env[name];
  if (value === undefined || value === "") {
    return null;
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be a whole number. See .env.example.`);
  }
  return Number(value);
}

export function apiLimits(env: Record<string, string | undefined> = process.env): ApiLimits {
  return {
    jsonBody: limitFrom(env, "API_JSON_BODY_MAX", API_JSON_BODY_MAX),
    releaseBody: optionalLimitFrom(env, "API_RELEASE_BODY_MAX"),
    screenshotBody: limitFrom(env, "API_SCREENSHOT_BODY_MAX", API_SCREENSHOT_BODY_MAX),
    ipPerMinute: limitFrom(env, "API_IP_PER_MINUTE", API_IP_PER_MINUTE),
    keyPerMinute: limitFrom(env, "API_KEY_PER_MINUTE", API_KEY_PER_MINUTE),
    uploadsPerHour: limitFrom(env, "UPLOADS_PER_HOUR", UPLOADS_PER_HOUR),
  };
}

export function releaseBodyLimit(limits: ApiLimits, uploadLimitMb: number | null): number {
  return releaseBodyMax(uploadLimitBytes(uploadLimitMb), limits.releaseBody);
}

function bodyLimit(limits: ApiLimits, kind: BodyKind, uploadLimitMb: number | null): number {
  if (kind === "release") {
    return releaseBodyLimit(limits, uploadLimitMb);
  }
  return kind === "json" ? limits.jsonBody : limits.screenshotBody;
}

function refuse(status: number, error: Problem, retryAfter?: number): { ok: false } & ApiRefusal {
  return retryAfter === undefined ? { ok: false, status, error } : { ok: false, status, error, retryAfter };
}

export type RateDeps = Pick<ApiDeps, "nowMs" | "count">;

export async function rateCheck(
  deps: RateDeps,
  name: string,
  limit: number,
  windowSeconds: number,
  hits = 1,
): Promise<number | null> {
  const now = deps.nowMs() / 1000;
  const window = Math.floor(now / windowSeconds);
  const left = Math.max(1, Math.ceil((window + 1) * windowSeconds - now));
  const n = await deps.count(`rate:${name}:${window}`, left, hits);
  return n > limit ? left : null;
}

// A chunked body has no Content-Length, on any method, so its size cannot be checked before it is read.
function checkSize(call: ApiCall, options: ApiOptions, limits: ApiLimits, uploadLimitMb: number | null): GateResult | null {
  const length = call.header("content-length");
  if (length === null) {
    return ["POST", "PUT"].includes(call.method.toUpperCase()) || call.header("transfer-encoding") !== null
      ? refuse(411, { code: "api.lengthRequired" })
      : null;
  }
  const max = bodyLimit(limits, options.body, uploadLimitMb);
  return Number(length) > max ? refuse(413, { code: "api.bodyTooLarge", max }) : null;
}

// A nonce is held until its timestamp leaves the window; after that the request is refused anyway.
async function checkSignature(call: ApiCall, deps: ApiDeps): Promise<SignedResult> {
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

// The user is not known before the signature check, so a release body is first held to the largest
// limit any user can have, then to the user's own.
export async function checkApiCall(call: ApiCall, options: ApiOptions, deps: ApiDeps): Promise<GateResult> {
  const size = checkSize(call, options, deps.limits, UPLOAD_LIMIT_MB_MAX);
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
  const userSize = checkSize(call, options, deps.limits, signed.user.uploadLimitMb);
  if (userSize) {
    return userSize;
  }
  const keyId = call.header("x-spun-key") ?? "";
  const keyLimit = signed.user.requestsPerMinute ?? deps.limits.keyPerMinute;
  const keyWait = await rateCheck(deps, `key:${keyId}`, keyLimit, 60);
  if (keyWait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, keyWait);
  }
  if (mustAcceptTerms(signed.user.acceptedTermsId, await deps.currentTermsId())) {
    return refuse(403, { code: "api.termsNotAccepted" });
  }
  return { ok: true, user: { id: signed.user.id, username: signed.user.username } };
}
