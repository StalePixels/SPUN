import "server-only";
import type { NextRequest } from "next/server";
import { apiLimits, checkApiCall, type ApiDeps, type ApiOptions, type ApiUser } from "./apigate";
import { apiKeyUser, serverKey } from "./apikeys";
import type { Problem } from "./problems";
import { claimOnce, countHit } from "./redis";

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
