import "server-only";
import { createMcpHandler, McpServer, type AuthInfo, type CallToolResult, type McpHttpHandler } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import * as z from "zod";
import { oauthGrants, users } from "@/db/schema";
import {
  apiAppFields,
  apiChangelog,
  apiDependsIds,
  apiError,
  apiForm,
  apiReleaseParams,
  apiReleaseUpload,
  apiRepublishFields,
  apiScreenshotParams,
  apiScreenshotUpload,
  clientIp,
} from "./api";
import { apiLimits, type ApiUser } from "./apigate";
import { addApp, deleteOwnApp, editApp, ownAppView, ownedApp, parseAppId, withCategoryInstallDir, type AppId } from "./apps";
import { liveCategories } from "./categories";
import { ownAppRows, savedAppRows } from "./catalogue";
import { db } from "./db";
import { setOwnDepends } from "./depends";
import { bearerToken, checkMcpCall, wwwAuthenticate, type McpDeps, type McpGrant } from "./mcpgate";
import {
  MCP_DESCRIPTIONS,
  MCP_FIELDS,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  MCP_UPLOAD_FIELDS,
  uploadCurl,
} from "./mcptext";
import { problemMessage } from "./messages";
import { urls } from "./oauthserver";
import type { Problem } from "./problems";
import { claimOnce, countHit, readValue, storeValue, takeValue } from "./redis";
import { checkReleaseText } from "./rules";
import { deleteOwnRelease, editChangelog, ownReleaseView, republishOwnRelease } from "./releases";
import { saveApp, unsaveApp } from "./saved";
import { clearOwnScreenshot } from "./screenshots";
import { currentTermsId } from "./terms";
import {
  makeTicket,
  takeTicket,
  type ReleaseText,
  type TicketDeps,
  type TicketGrant,
  type TicketUser,
  type UploadTicket,
} from "./uploadticket";

async function findGrant(accessHash: string): Promise<McpGrant | null> {
  const [row] = await db()
    .select({
      id: oauthGrants.id,
      clientIdHash: oauthGrants.clientIdHash,
      userId: oauthGrants.userId,
      username: users.username,
      disabledAt: users.disabledAt,
      deletedAt: oauthGrants.deletedAt,
      accessExpiresAt: oauthGrants.accessExpiresAt,
      acceptedTermsId: users.acceptedTermsId,
    })
    .from(oauthGrants)
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(eq(oauthGrants.accessHash, accessHash));
  return row ? { ...row, userDisabled: row.disabledAt !== null } : null;
}

async function touchGrant(grantId: string, now: Date): Promise<void> {
  await db().update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, grantId));
}

function deps(): McpDeps {
  return {
    nowMs: () => Date.now(),
    limits: apiLimits(),
    findGrant,
    currentTermsId,
    claimOnce,
    count: countHit,
    touchGrant,
  };
}

function toolValue(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolProblem(error: Problem): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error, message: problemMessage(error) }) }] };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const ADDS_ONCE = { ...ADDS, idempotentHint: true };
const REPLACES = { ...ADDS, destructiveHint: true, idempotentHint: true };

function toolDone(result: { error?: Problem }): CallToolResult {
  return result.error ? toolProblem(result.error) : toolValue({});
}

// The SDK would send an exception's message, which can hold SQL, to the client.
function safe<A extends unknown[]>(handler: (...args: A) => Promise<CallToolResult>): (...args: A) => Promise<CallToolResult> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("MCP tool failed:", error);
      return toolProblem({ code: "mcp.internal" });
    }
  };
}

const appIdInput = z.string().describe(MCP_FIELDS.appId);
const serialInput = z.union([z.number().int(), z.string()]).describe(MCP_FIELDS.serial);
const slotInput = z.union([z.number().int(), z.string()]).describe(MCP_FIELDS.slot);
const appFieldsInput = {
  title: z.string().optional().describe(MCP_FIELDS.title),
  description: z.string().optional().describe(MCP_FIELDS.description),
  installDir: z.string().optional().describe(MCP_FIELDS.installDir),
  categories: z.array(z.number().int()).optional().describe(MCP_FIELDS.categories),
};

type McpContext = { user: ApiUser; grantId: string };

function mcpServer({ user, grantId }: McpContext): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: MCP_INSTRUCTIONS,
    capabilities: { tools: { listChanged: false } },
  });
  server.registerTool(
    MCP_TOOLS.listCategories,
    { description: MCP_DESCRIPTIONS.listCategories, annotations: READ_ONLY },
    safe(async () => toolValue({ categories: (await liveCategories()).map(({ id, name }) => ({ id, name })) })),
  );
  server.registerTool(
    MCP_TOOLS.listApps,
    { description: MCP_DESCRIPTIONS.listApps, annotations: READ_ONLY },
    safe(async () => toolValue({ apps: await ownAppRows(user.id) })),
  );
  server.registerTool(
    MCP_TOOLS.getApp,
    {
      description: MCP_DESCRIPTIONS.getApp,
      inputSchema: z.object({ id: appIdInput }),
      annotations: READ_ONLY,
    },
    safe(async ({ id }) => {
      const appId = parseAppId(id);
      const view = appId ? await ownAppView(user.id, appId) : null;
      return view ? toolValue(view) : toolProblem({ code: "app.notFound" });
    }),
  );
  server.registerTool(
    MCP_TOOLS.getRelease,
    {
      description: MCP_DESCRIPTIONS.getRelease,
      inputSchema: z.object({ id: appIdInput, serial: serialInput }),
      annotations: READ_ONLY,
    },
    safe(async ({ id, serial }) => {
      const target = apiReleaseParams({ id, serial: String(serial) });
      if ("error" in target) {
        return toolProblem(target.error);
      }
      const result = await ownReleaseView(user, target.appId, target.serial);
      return "error" in result ? toolProblem(result.error) : toolValue(result.value);
    }),
  );
  server.registerTool(
    MCP_TOOLS.listSaved,
    { description: MCP_DESCRIPTIONS.listSaved, annotations: READ_ONLY },
    safe(async () => toolValue({ saved: await savedAppRows(user.id) })),
  );
  registerWriteTools(server, user);
  registerUploadTools(server, user, grantId);
  return server;
}

function registerWriteTools(server: McpServer, user: ApiUser): void {
  const withAppId = (id: string, act: (appId: AppId) => Promise<CallToolResult>) => {
    const appId = parseAppId(id);
    return appId ? act(appId) : toolProblem({ code: "app.notFound" });
  };
  server.registerTool(
    MCP_TOOLS.createApp,
    { description: MCP_DESCRIPTIONS.createApp, inputSchema: z.object(appFieldsInput), annotations: ADDS },
    safe(async (args) => {
      const result = await addApp(user.id, await withCategoryInstallDir(apiAppFields(args)));
      return "error" in result ? toolProblem(result.error) : toolValue({ id: result.id });
    }),
  );
  server.registerTool(
    MCP_TOOLS.updateApp,
    {
      description: MCP_DESCRIPTIONS.updateApp,
      inputSchema: z.object({ id: appIdInput, ...appFieldsInput }),
      annotations: REPLACES,
    },
    safe(async ({ id, ...fields }) =>
      withAppId(id, async (appId) => toolDone(await editApp(user.id, appId, () => withCategoryInstallDir(apiAppFields(fields)))))),
  );
  server.registerTool(
    MCP_TOOLS.deleteApp,
    { description: MCP_DESCRIPTIONS.deleteApp, inputSchema: z.object({ id: appIdInput }), annotations: REPLACES },
    safe(async ({ id }) => withAppId(id, async (appId) => toolDone(await deleteOwnApp(user, appId)))),
  );
  server.registerTool(
    MCP_TOOLS.setDepends,
    {
      description: MCP_DESCRIPTIONS.setDepends,
      inputSchema: z.object({ id: appIdInput, depends: z.array(z.string()).optional().describe(MCP_FIELDS.depends) }),
      annotations: REPLACES,
    },
    safe(async ({ id, ...body }) =>
      withAppId(id, async (appId) => toolDone(await setOwnDepends(user.id, appId, async () => apiDependsIds(body))))),
  );
  server.registerTool(
    MCP_TOOLS.republishApp,
    {
      description: MCP_DESCRIPTIONS.republishApp,
      inputSchema: z.object({
        id: appIdInput,
        version: z.string().optional().describe(MCP_FIELDS.version),
        changelog: z.string().optional().describe(MCP_FIELDS.changelog),
      }),
      annotations: ADDS,
    },
    safe(async ({ id, ...body }) =>
      withAppId(id, async (appId) => {
        const result = await republishOwnRelease(user.id, appId, async () => apiRepublishFields(body));
        return "error" in result ? toolProblem(result.error) : toolValue({ serial: result.serial, dotMoves: result.dotMoves });
      })),
  );
  server.registerTool(
    MCP_TOOLS.setChangelog,
    {
      description: MCP_DESCRIPTIONS.setChangelog,
      inputSchema: z.object({
        id: appIdInput,
        serial: serialInput,
        changelog: z.string().optional().describe(MCP_FIELDS.changelog),
      }),
      annotations: REPLACES,
    },
    safe(async ({ id, serial, ...body }) => {
      const target = apiReleaseParams({ id, serial: String(serial) });
      if ("error" in target) {
        return toolProblem(target.error);
      }
      return toolDone(await editChangelog(user.id, target.appId, target.serial, async () => apiChangelog(body)));
    }),
  );
  server.registerTool(
    MCP_TOOLS.deleteRelease,
    {
      description: MCP_DESCRIPTIONS.deleteRelease,
      inputSchema: z.object({ id: appIdInput, serial: serialInput }),
      annotations: REPLACES,
    },
    safe(async ({ id, serial }) => {
      const target = apiReleaseParams({ id, serial: String(serial) });
      return "error" in target
        ? toolProblem(target.error)
        : toolDone(await deleteOwnRelease(user, target.appId, target.serial));
    }),
  );
  server.registerTool(
    MCP_TOOLS.deleteScreenshot,
    {
      description: MCP_DESCRIPTIONS.deleteScreenshot,
      inputSchema: z.object({ id: appIdInput, slot: slotInput }),
      annotations: REPLACES,
    },
    safe(async ({ id, slot }) => {
      const target = apiScreenshotParams({ id, slot: String(slot) });
      return "error" in target
        ? toolProblem(target.error)
        : toolDone(await clearOwnScreenshot(user, target.appId, target.slot));
    }),
  );
  server.registerTool(
    MCP_TOOLS.saveApp,
    { description: MCP_DESCRIPTIONS.saveApp, inputSchema: z.object({ id: appIdInput }), annotations: ADDS_ONCE },
    safe(async ({ id }) => withAppId(id, async (appId) => toolDone(await saveApp(user.id, appId)))),
  );
  server.registerTool(
    MCP_TOOLS.unsaveApp,
    { description: MCP_DESCRIPTIONS.unsaveApp, inputSchema: z.object({ id: appIdInput }), annotations: REPLACES },
    safe(async ({ id }) =>
      withAppId(id, async (appId) => {
        await unsaveApp(user.id, appId);
        return toolValue({});
      })),
  );
}

async function findTicketUser(userId: string): Promise<TicketUser | null> {
  const [row] = await db()
    .select({ username: users.username, disabledAt: users.disabledAt, acceptedTermsId: users.acceptedTermsId })
    .from(users)
    .where(eq(users.id, userId));
  return row ? { username: row.username, disabled: row.disabledAt !== null, acceptedTermsId: row.acceptedTermsId } : null;
}

async function findTicketGrant(grantId: string): Promise<TicketGrant | null> {
  const [row] = await db()
    .select({ deletedAt: oauthGrants.deletedAt, refreshExpiresAt: oauthGrants.refreshExpiresAt })
    .from(oauthGrants)
    .where(eq(oauthGrants.id, grantId));
  return row ?? null;
}

function ticketDeps(): TicketDeps {
  return {
    nowMs: () => Date.now(),
    limits: apiLimits(),
    count: countHit,
    storeValue,
    readValue,
    takeValue,
    findUser: findTicketUser,
    findGrant: findTicketGrant,
    currentTermsId,
  };
}

async function uploadUrl(ticket: UploadTicket): Promise<CallToolResult> {
  const { token, expiresAt } = await makeTicket(ticket, ticketDeps());
  const url = `${urls().issuer}/upload/${token}`;
  return toolValue({
    url,
    expiresAt: expiresAt.toISOString(),
    method: "POST",
    fields: MCP_UPLOAD_FIELDS[ticket.kind],
    curl: uploadCurl(ticket.kind, url),
  });
}

function registerUploadTools(server: McpServer, user: ApiUser, grantId: string): void {
  server.registerTool(
    MCP_TOOLS.uploadRelease,
    {
      description: MCP_DESCRIPTIONS.uploadRelease,
      inputSchema: z.object({
        id: appIdInput,
        version: z.string().optional().describe(MCP_FIELDS.version),
        releaseDate: z.string().optional().describe(MCP_FIELDS.releaseDate),
        changelog: z.string().optional().describe(MCP_FIELDS.changelog),
      }),
      annotations: ADDS,
    },
    safe(async ({ id, version = "", releaseDate = "", changelog = "" }) => {
      const appId = parseAppId(id);
      if (!appId || !(await ownedApp(user.id, appId))) {
        return toolProblem({ code: "app.notFound" });
      }
      const error = checkReleaseText(version, releaseDate, changelog, new Date());
      return error
        ? toolProblem(error)
        : uploadUrl({ userId: user.id, grantId, appId, kind: "release", slot: null, version, releaseDate, changelog });
    }),
  );
  server.registerTool(
    MCP_TOOLS.uploadScreenshot,
    {
      description: MCP_DESCRIPTIONS.uploadScreenshot,
      inputSchema: z.object({ id: appIdInput, slot: slotInput }),
      annotations: ADDS,
    },
    safe(async ({ id, slot }) => {
      const target = apiScreenshotParams({ id, slot: String(slot) });
      if ("error" in target) {
        return toolProblem(target.error);
      }
      return (await ownedApp(user.id, target.appId))
        ? uploadUrl({ userId: user.id, grantId, appId: target.appId, kind: "screenshot", slot: target.slot })
        : toolProblem({ code: "app.notFound" });
    }),
  );
}

// The text fields come from the ticket; only the file comes from the upload.
async function ticketForm(text: ReleaseText, request: NextRequest): Promise<FormData> {
  const sent = await apiForm(request);
  const form = new FormData();
  form.set("version", text.version);
  form.set("releaseDate", text.releaseDate);
  form.set("changelog", text.changelog);
  const file = sent.get("file");
  if (file !== null) {
    form.set("file", file);
  }
  return form;
}

export async function uploadPost(request: NextRequest, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params;
  const gate = await takeTicket({ ip: clientIp(request), header: (name) => request.headers.get(name) }, token, ticketDeps());
  if (!gate.ok) {
    return apiError(gate.status, gate.error, gate.retryAfter);
  }
  const { ticket, user } = gate;
  const appId = parseAppId(ticket.appId);
  if (!appId) {
    return apiError(404, { code: "upload.badTicket" });
  }
  return ticket.kind === "release"
    ? apiReleaseUpload(user.id, appId, request, () => ticketForm(ticket, request))
    : apiScreenshotUpload(user, appId, ticket.slot, request);
}

// The gate has checked the token; the handler only passes authInfo through to the factory.
function contextOf(authInfo: AuthInfo | undefined): McpContext {
  const user = authInfo?.extra?.user as ApiUser | undefined;
  const grantId = authInfo?.extra?.grantId;
  if (!user || typeof grantId !== "string") {
    throw new Error("An MCP request reached the handler without a user.");
  }
  return { user, grantId };
}

let handler: McpHttpHandler | undefined;

function mcpHandler(): McpHttpHandler {
  handler ??= createMcpHandler(({ authInfo }) => mcpServer(contextOf(authInfo)), {
    legacy: "stateless",
    responseMode: "json",
    maxRequestBodySize: apiLimits().jsonBody,
    onerror: (error) => console.error("MCP request failed:", error),
  });
  return handler;
}

// Next compresses event streams and nginx buffers them; either would hold back each event.
function unbuffered(response: Response): Response {
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function mcpPost(request: NextRequest): Promise<Response> {
  const gate = await checkMcpCall(
    { ip: clientIp(request), header: (name) => request.headers.get(name), text: () => request.text() },
    deps(),
  );
  if (!gate.ok) {
    const response = apiError(gate.status, gate.error, gate.retryAfter);
    if (gate.status === 401) {
      response.headers.set("WWW-Authenticate", wwwAuthenticate(urls().resourceMetadata, gate.error));
    }
    return response;
  }
  const authInfo: AuthInfo = {
    token: bearerToken(request.headers.get("authorization")) ?? "",
    clientId: gate.grant.clientIdHash,
    scopes: [],
    expiresAt: Math.floor(gate.grant.accessExpiresAt.getTime() / 1000),
    resource: new URL(urls().resource),
    resourceMetadataUrl: urls().resourceMetadata,
    extra: { user: gate.user, grantId: gate.grant.id },
  };
  if (gate.body === null) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error: the request body is not valid JSON" }, id: null },
      { status: 400 },
    );
  }
  return unbuffered(await mcpHandler().fetch(request, { authInfo, parsedBody: gate.body.value }));
}

export function mcpMethodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
