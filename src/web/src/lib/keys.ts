import { createHmac, timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";
import { API_REQUEST_WINDOW_SECONDS } from "./rules";

export const KEY_ID_LENGTH = 16;
export const KEY_PREFIX = "nbnspun-";

const KEY_ID_RE = /^[0-9a-z]{16}$/;
const KEY_RE = /^nbnspun-([0-9a-z]{16})-([0-9a-f]{64})$/;
const NONCE_RE = /^[A-Za-z0-9]{16,64}$/;
const TIMESTAMP_RE = /^[0-9]{1,12}$/;
const SIGNATURE_RE = /^[0-9a-f]{64}$/i;

const generateKeyId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", KEY_ID_LENGTH);

export function newKeyId(): string {
  return generateKeyId();
}

export function parseKeyId(value: string): string | null {
  return KEY_ID_RE.test(value) ? value : null;
}

export function keySecret(serverKey: string, keyId: string): string {
  return createHmac("sha256", serverKey).update(keyId).digest("hex");
}

export function keyString(keyId: string, secret: string): string {
  return `${KEY_PREFIX}${keyId}-${secret}`;
}

export function parseKeyString(value: string): { keyId: string; secret: string } | null {
  const match = KEY_RE.exec(value);
  return match ? { keyId: match[1], secret: match[2] } : null;
}

export function isNonce(value: string): boolean {
  return NONCE_RE.test(value);
}

export function parseTimestamp(value: string): number | null {
  return TIMESTAMP_RE.test(value) ? Number(value) : null;
}

export function timestampInWindow(timestamp: number, nowSeconds: number): boolean {
  return Math.abs(nowSeconds - timestamp) <= API_REQUEST_WINDOW_SECONDS;
}

export function signedText(method: string, pathWithQuery: string, timestamp: string, nonce: string): string {
  return [method.toUpperCase(), pathWithQuery, timestamp, nonce].join("\n");
}

export function sign(secret: string, text: string): string {
  return createHmac("sha256", secret).update(text).digest("hex");
}

export function isSignature(value: string): boolean {
  return SIGNATURE_RE.test(value);
}

export function signatureMatches(expected: string, given: string): boolean {
  return isSignature(given) && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}
