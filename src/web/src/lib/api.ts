import "server-only";
import type { NextRequest } from "next/server";
import { apiLimits, checkApiCall, type ApiDeps, type ApiOptions, type ApiUser } from "./apigate";
import { apiKeyUser, serverKey } from "./apikeys";
import { parseAppId, type AppFields, type AppId } from "./apps";
import type { Problem } from "./problems";
import { claimOnce, countHit } from "./redis";
import { parseSerial, parseSlot } from "./rules";

export type ApiContext<P> = { request: NextRequest; user: ApiUser; params: P };

function deps(): ApiDeps {
  return {
    nowMs: () => Date.now(),
    serverKey,
    limits: apiLimits(),
    findKeyUser: apiKeyUser,
    claimOnce,
    count: countHit,
  };
}

// Next sets X-Forwarded-For to the socket address when a request has none.
function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

export function apiJson(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

export function apiError(status: number, error: Problem, retryAfter?: number): Response {
  const headers = retryAfter === undefined ? undefined : { "Retry-After": String(retryAfter) };
  return Response.json({ error }, { status, headers });
}

export function apiProblem(error: Problem): Response {
  return apiError(error.code.endsWith(".notFound") ? 404 : 400, error);
}

// A body that is not a JSON object reads as one with no fields, as a form with no fields does.
export async function apiBody(request: NextRequest): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export async function apiForm(request: NextRequest): Promise<FormData> {
  return request.formData().catch(() => new FormData());
}

export function apiReleaseParams(params: {
  id: string;
  serial: string;
}): { error: Problem } | { appId: AppId; serial: number } {
  const appId = parseAppId(params.id);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const serial = parseSerial(params.serial);
  return serial ? { appId, serial } : { error: { code: "release.notFound" } };
}

export function apiScreenshotParams(params: {
  id: string;
  slot: string;
}): { error: Problem } | { appId: AppId; slot: number } {
  const appId = parseAppId(params.id);
  if (!appId) {
    return { error: { code: "app.notFound" } };
  }
  const slot = parseSlot(params.slot);
  return slot ? { appId, slot } : { error: { code: "screenshot.notFound" } };
}

export function apiAppFields(body: Record<string, unknown>): AppFields {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    title: text(body.title),
    description: text(body.description),
    categories: Array.isArray(body.categories) ? body.categories.filter((value) => Number.isInteger(value)) : [],
  };
}

export function apiRoute<P = object>(
  options: ApiOptions,
  handler: (context: ApiContext<P>) => Promise<Response>,
) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    const result = await checkApiCall(
      {
        method: request.method,
        pathWithQuery: request.nextUrl.pathname + request.nextUrl.search,
        ip: clientIp(request),
        header: (name) => request.headers.get(name),
      },
      options,
      deps(),
    );
    if (!result.ok) {
      return apiError(result.status, result.error, result.retryAfter);
    }
    return handler({ request, user: result.user, params: await context.params });
  };
}
