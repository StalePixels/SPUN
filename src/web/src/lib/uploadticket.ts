import { rateCheck, releaseBodyLimit, type ApiLimits, type ApiRefusal, type ApiUser } from "./apigate";
import { newSecret, tokenHash } from "./oauth";
import type { Problem } from "./problems";
import { APP_ID_RE, MCP_UPLOAD_TICKET_SECONDS, mustAcceptTerms, SCREENSHOT_SLOTS } from "./rules";

export type ReleaseText = { version: string; releaseDate: string; changelog: string };

export type UploadTicket =
  | ({ userId: string; grantId: string; appId: string; kind: "release"; slot: null } & ReleaseText)
  | { userId: string; grantId: string; appId: string; kind: "screenshot"; slot: number };

export type TicketUser = {
  username: string | null;
  disabled: boolean;
  acceptedTermsId: number | null;
  uploadLimitMb: number | null;
};

export type TicketGrant = { deletedAt: Date | null; refreshExpiresAt: Date };

export type TicketCall = {
  ip: string;
  header(name: string): string | null;
};

export type TicketDeps = {
  nowMs(): number;
  limits: ApiLimits;
  count(name: string, ttlSeconds: number): Promise<number>;
  storeValue(name: string, value: string, ttlSeconds: number): Promise<void>;
  readValue(name: string): Promise<string | null>;
  takeValue(name: string): Promise<string | null>;
  findUser(userId: string): Promise<TicketUser | null>;
  findGrant(grantId: string): Promise<TicketGrant | null>;
  currentTermsId(): Promise<number | null>;
};

export type TicketResult = { ok: true; ticket: UploadTicket; user: ApiUser } | ({ ok: false } & ApiRefusal);

// newSecret() gives 32 random bytes as base64url.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function ticketKey(token: string): string {
  return `mcp:upload:${tokenHash(token)}`;
}

export function parseTicket(text: string | null): UploadTicket | null {
  let value: unknown = null;
  try {
    value = text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { userId, grantId, appId, kind, slot, version, releaseDate, changelog } = value as Record<string, unknown>;
  if (
    typeof userId !== "string" ||
    userId === "" ||
    typeof grantId !== "string" ||
    grantId === "" ||
    typeof appId !== "string" ||
    !APP_ID_RE.test(appId)
  ) {
    return null;
  }
  if (
    kind === "release" &&
    slot === null &&
    typeof version === "string" &&
    typeof releaseDate === "string" &&
    typeof changelog === "string"
  ) {
    return { userId, grantId, appId, kind, slot, version, releaseDate, changelog };
  }
  if (kind === "screenshot" && Number.isInteger(slot) && (slot as number) >= 1 && (slot as number) <= SCREENSHOT_SLOTS) {
    return { userId, grantId, appId, kind, slot: slot as number };
  }
  return null;
}

export async function makeTicket(
  ticket: UploadTicket,
  deps: Pick<TicketDeps, "nowMs" | "storeValue">,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSecret();
  await deps.storeValue(ticketKey(token), JSON.stringify(ticket), MCP_UPLOAD_TICKET_SECONDS);
  return { token, expiresAt: new Date(deps.nowMs() + MCP_UPLOAD_TICKET_SECONDS * 1000) };
}

function refuse(status: number, error: Problem, retryAfter?: number): { ok: false } & ApiRefusal {
  return retryAfter === undefined ? { ok: false, status, error } : { ok: false, status, error, retryAfter };
}

const BAD_TICKET = refuse(404, { code: "upload.badTicket" });

// The ticket is read first, to know its body limit; only the take uses it up, so a body that is too large keeps it.
export async function takeTicket(call: TicketCall, token: string, deps: TicketDeps): Promise<TicketResult> {
  const length = call.header("content-length");
  if (length === null) {
    return refuse(411, { code: "api.lengthRequired" });
  }
  const wait = await rateCheck(deps, `upload-url:${call.ip}`, deps.limits.ipPerMinute, 60);
  if (wait !== null) {
    return refuse(429, { code: "api.tooManyRequests" }, wait);
  }
  if (!TOKEN_RE.test(token)) {
    return BAD_TICKET;
  }
  const key = ticketKey(token);
  const waiting = parseTicket(await deps.readValue(key));
  if (!waiting) {
    return BAD_TICKET;
  }
  const max =
    waiting.kind === "release"
      ? releaseBodyLimit(deps.limits, (await deps.findUser(waiting.userId))?.uploadLimitMb ?? null)
      : deps.limits.screenshotBody;
  if (Number(length) > max) {
    return refuse(413, { code: "api.bodyTooLarge", max });
  }
  const ticket = parseTicket(await deps.takeValue(key));
  if (!ticket) {
    return BAD_TICKET;
  }
  const grant = await deps.findGrant(ticket.grantId);
  if (!grant || grant.deletedAt !== null || grant.refreshExpiresAt.getTime() <= deps.nowMs()) {
    return BAD_TICKET;
  }
  const user = await deps.findUser(ticket.userId);
  if (!user || user.disabled || user.username === null) {
    return BAD_TICKET;
  }
  if (mustAcceptTerms(user.acceptedTermsId, await deps.currentTermsId())) {
    return refuse(403, { code: "api.termsNotAccepted" });
  }
  return { ok: true, ticket, user: { id: ticket.userId, username: user.username } };
}
