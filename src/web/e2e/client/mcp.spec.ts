import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { APIRequestContext } from "@playwright/test";
import { makeApiKey, signedFetch, signedJson, type ApiKey } from "../support/api";
import {
  appCategoryIds,
  appMinCore,
  appRow,
  dependsOf,
  grantRowsOfClient,
  insertApp,
  insertUser,
  isSaved,
  liveAppIdsOf,
  markAppDeleted,
  markGrantDeleted,
  releaseRow,
  removeApps,
  removeTestUser,
  screenshotRows,
  setUserAppLimit,
  setUserDisabled,
  userByUsername,
  withTableRenamed,
} from "../support/db";
import { readyNxi, stripesPng } from "../support/images";
import { keyPerMinute, setRateCount } from "../support/redis";
import { connectMcpClient, MCP_URL, ORIGIN, RESOURCE_METADATA } from "../support/oauth";
import { binFile, clickHydrated, expect, releaseFile, test, todayUtc, uniqueTitle } from "../support/pages";
import { accounts, settings } from "../support/settings";
import { makeZip, sampleEntries } from "../support/zips";
import { problemMessage } from "../../src/lib/messages";
import type { Problem } from "../../src/lib/problems";
import { CHANGELOG_MAX, MCP_UPLOAD_TICKET_SECONDS } from "../../src/lib/rules";

const SPUN_VERSION = readFileSync(path.join(__dirname, "..", "..", "..", "client", "VERSION"), "utf8").trim();

const READ_TOOLS = ["get_app", "get_release", "list_apps", "list_categories", "list_saved", "search_depends"];
// Each write tool with its destructiveHint and idempotentHint.
const WRITE_TOOLS: Record<string, [boolean, boolean]> = {
  create_app: [false, false],
  update_app: [true, true],
  delete_app: [true, true],
  set_depends: [true, true],
  republish_app: [false, false],
  set_changelog: [true, true],
  delete_release: [true, true],
  delete_screenshot: [true, true],
  save_app: [false, true],
  unsave_app: [true, true],
  upload_release: [false, false],
  upload_screenshot: [false, false],
};
const ALL_TOOLS = [...READ_TOOLS, ...Object.keys(WRITE_TOOLS)].sort();

// A 2026-07-28 client starts with server/discover; a 2025-11-25 client with initialize.
const ERAS = [
  { version: "2026-07-28", era: "modern", options: { versionNegotiation: { mode: { pin: "2026-07-28" } } } },
  { version: "2025-11-25", era: "legacy", options: {} },
] as const;

async function mcpClient(token: string, era: (typeof ERAS)[number]): Promise<Client> {
  const client = new Client({ name: "spun-e2e", version: "1.0.0" }, era.options);
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: { token: async () => token } }));
  expect(client.getProtocolEra()).toBe(era.era);
  expect(client.getNegotiatedProtocolVersion()).toBe(era.version);
  return client;
}

async function callJson(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as { type: string; text: string }[];
  expect(content.type).toBe("text");
  return { isError: result.isError === true, body: JSON.parse(content.text) as Record<string, unknown> };
}

function toolProblem(error: Problem) {
  return { isError: true, body: { error, message: problemMessage(error) } };
}

// A 2025-era tools/list request as a client sends it, without the SDK, to see the HTTP answer.
async function rawToolsList(request: APIRequestContext, authorization?: string, headers: Record<string, string> = {}) {
  return request.post("/mcp", {
    headers: {
      Accept: "application/json, text/event-stream",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
      ...headers,
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
}

// The JSON-RPC messages in a 2025-era answer, which is an event stream.
async function streamMessages(response: { text(): Promise<string> }): Promise<{ id: number }[]> {
  return (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => JSON.parse(line.slice("data: ".length)) as { id: number } | { id: number }[]);
}

test("each read tool gives what its API call gives, to a 2026-07-28 and a 2025-11-25 client, with a token from the OAuth flow", async ({ page }) => {
  const key = await makeApiKey(page);
  const categories = await signedJson(page.request, key, "GET", "/api/categories");
  const [category] = categories.body.categories as { id: number }[];
  const made = await signedJson(page.request, key, "POST", "/api/apps", {
    title: uniqueTitle("MCP read"),
    description: "Read through MCP.",
    categories: [category.id],
  });
  expect(made.status).toBe(201);
  const id = made.body.id as string;
  try {
    const uploaded = await signedFetch(page.request, key, `/api/apps/${id}/releases`, {
      method: "POST",
      multipart: {
        version: "1.0",
        changelog: "First.",
        file: { name: "game.zip", mimeType: "application/zip", buffer: makeZip(sampleEntries()) },
      },
    });
    expect(uploaded.status()).toBe(201);
    expect(await signedJson(page.request, key, "PUT", `/api/saved/${id}`)).toEqual({ status: 200, body: {} });

    const { accessToken } = await connectMcpClient(page, `E2E MCP read ${Date.now().toString(36)}`);
    for (const era of ERAS) {
      const client = await mcpClient(accessToken, era);
      try {
        await readToolChecks(client, page.request, key, id);
      } finally {
        await client.close();
      }
    }
  } finally {
    await removeApps([id]);
  }
});

async function readToolChecks(client: Client, request: APIRequestContext, key: ApiKey, id: string) {
  expect(client.getServerVersion()).toMatchObject({ name: "SPUN", version: SPUN_VERSION });
  expect(client.getServerCapabilities()?.tools?.listChanged).toBeFalsy();
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name).sort()).toEqual(ALL_TOOLS);
  for (const tool of tools) {
    expect(tool.description, tool.name).toBeTruthy();
    expect(tool.annotations?.readOnlyHint, tool.name).toBe(READ_TOOLS.includes(tool.name));
    expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    if (tool.name in WRITE_TOOLS) {
      const [destructive, idempotent] = WRITE_TOOLS[tool.name];
      expect(tool.annotations?.destructiveHint, tool.name).toBe(destructive);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(idempotent);
    }
  }

  const api = async (path: string) => (await signedJson(request, key, "GET", path)).body;
  expect(await callJson(client, "list_categories")).toEqual({ isError: false, body: await api("/api/categories") });
  expect(await callJson(client, "list_apps")).toEqual({ isError: false, body: await api("/api/apps") });
  expect(await callJson(client, "get_app", { id: id.toUpperCase() })).toEqual({
    isError: false,
    body: await api(`/api/apps/${id}`),
  });
  const release = await callJson(client, "get_release", { id, serial: 1 });
  expect(release).toEqual({ isError: false, body: await api(`/api/apps/${id}/releases/1`) });
  expect(release.body.files).toEqual(sampleEntries().map((entry) => entry.name));
  expect(await callJson(client, "get_release", { id, serial: "1" })).toEqual(release);
  const saved = await callJson(client, "list_saved");
  expect(saved).toEqual({ isError: false, body: await api("/api/saved") });
  expect((saved.body.saved as { id: string }[]).map((app) => app.id)).toContain(id);

  expect(await callJson(client, "get_app", { id: "not-an-id" })).toEqual(toolProblem({ code: "app.notFound" }));
  expect(await callJson(client, "get_release", { id, serial: 2 })).toEqual(toolProblem({ code: "release.notFound" }));
  expect(await callJson(client, "get_release", { id, serial: 0 })).toEqual(toolProblem({ code: "release.notFound" }));
  expect(await callJson(client, "get_release", { id: "zzzzzz", serial: 1 })).toEqual(toolProblem({ code: "app.notFound" }));
}

test("/mcp refuses a request with no token or a bad token with 401 and the resource metadata URL", async ({ page }) => {
  const none = await rawToolsList(page.request);
  expect(none.status()).toBe(401);
  expect(none.headers()["www-authenticate"]).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}"`);
  expect(await none.json()).toEqual({ error: { code: "mcp.noToken" } });

  for (const token of ["nbnspun-at-not-a-real-token", "something-else"]) {
    const bad = await rawToolsList(page.request, `Bearer ${token}`);
    expect(bad.status(), token).toBe(401);
    expect(bad.headers()["www-authenticate"]).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", error="invalid_token"`);
    expect(await bad.json()).toEqual({ error: { code: "mcp.badToken" } });
  }

  for (const method of ["GET", "DELETE"]) {
    const refused = await page.request.fetch("/mcp", { method });
    expect(refused.status(), method).toBe(405);
    expect(refused.headers().allow).toBe("POST");
  }
});

test("/mcp refuses a request with an Origin header with 403, even with a good token", async ({ page }) => {
  const { accessToken } = await connectMcpClient(page, `E2E MCP origin ${Date.now().toString(36)}`);
  for (const origin of [ORIGIN, "https://evil.example", "null"]) {
    const refused = await rawToolsList(page.request, `Bearer ${accessToken}`, { Origin: origin });
    expect(refused.status(), origin).toBe(403);
    expect(await refused.json()).toEqual({ error: { code: "mcp.origin" } });
  }
  expect((await rawToolsList(page.request, `Bearer ${accessToken}`)).status()).toBe(200);
});

test("each message of a JSON-RPC batch counts towards the client's rate limit", async ({ page }) => {
  const { clientId, accessToken } = await connectMcpClient(page, `E2E MCP batch ${Date.now().toString(36)}`);
  const [grant] = await grantRowsOfClient(clientId);
  const batch = (n: number) =>
    page.request.post("/mcp", {
      headers: { Accept: "application/json, text/event-stream", Authorization: `Bearer ${accessToken}` },
      data: Array.from({ length: n }, (_, id) => ({ jsonrpc: "2.0", id, method: "tools/list" })),
    });
  await setRateCount(`grant:${grant.id}`, keyPerMinute - 4);
  const answered = await batch(3);
  expect(answered.status()).toBe(200);
  expect((await streamMessages(answered)).map((message) => message.id).sort()).toEqual([0, 1, 2]);
  const refused = await batch(2);
  expect(refused.status()).toBe(429);
  expect(await refused.json()).toEqual({ error: { code: "api.tooManyRequests" } });
  expect((await rawToolsList(page.request, `Bearer ${accessToken}`)).status()).toBe(429);
});

// The e2e CMS's container, from make e2e-up (docker compose project spun-e2e-cms).
function cmsLogSince(since: string): string {
  const id = execFileSync("docker", ["ps", "-q", "--filter", "label=com.docker.compose.project=spun-e2e-cms"], { encoding: "utf8" }).trim();
  return execFileSync("sh", ["-c", 'docker logs --since "$1" "$2" 2>&1', "sh", since, id], { encoding: "utf8" });
}

test("a tool that fails inside gives mcp.internal with no detail, and the CMS logs the error", async ({ page }) => {
  const { accessToken } = await connectMcpClient(page, `E2E MCP fault ${Date.now().toString(36)}`);
  const client = await mcpClient(accessToken, ERAS[0]);
  try {
    const since = new Date(Date.now() - 1000).toISOString();
    const result = await withTableRenamed("saved_apps", () => client.callTool({ name: "list_saved", arguments: {} }));
    const [content] = result.content as { type: string; text: string }[];
    expect(result.isError).toBe(true);
    expect(JSON.parse(content.text)).toEqual(toolProblem({ code: "mcp.internal" }).body);
    expect(content.text).not.toMatch(/saved_apps|select|query/i);
    await expect.poll(() => cmsLogSince(since)).toMatch(/MCP tool failed:[\s\S]*saved_apps/);
    expect((await callJson(client, "list_saved")).isError).toBe(false);
  } finally {
    await client.close();
  }
});

test("an access token works until the user disconnects its client on /me/keys", async ({ page }) => {
  const name = `E2E MCP revoke ${Date.now().toString(36)}`;
  const { clientId, accessToken } = await connectMcpClient(page, name);

  const allowed = await rawToolsList(page.request, `Bearer ${accessToken}`);
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()).toMatchObject({
    "content-type": expect.stringContaining("text/event-stream"),
    "cache-control": "no-cache, no-transform",
    "x-accel-buffering": "no",
  });
  expect(allowed.headers()["mcp-session-id"]).toBeUndefined();
  expect(allowed.headers()["content-encoding"]).toBeUndefined();
  const event = (await allowed.text()).split("\n").find((line) => line.startsWith("data: ")) ?? "";
  const listed = JSON.parse(event.slice("data: ".length)) as { result: { tools: { name: string }[] } };
  expect(listed.result.tools.map((tool) => tool.name).sort()).toEqual(ALL_TOOLS);
  const [grant] = await grantRowsOfClient(clientId);

  await page.goto("/me/keys");
  const row = page.getByTestId(`grant-${grant.id}`);
  await expect(row.getByTestId("grant-name")).toHaveText(name);
  await clickHydrated(row.getByTestId("revoke-grant"));
  await page.getByTestId("revoke-grant-confirm").click();
  await expect(row).toHaveCount(0);

  const refused = await rawToolsList(page.request, `Bearer ${accessToken}`);
  expect(refused.status()).toBe(401);
  expect(refused.headers()["www-authenticate"]).toContain('error="invalid_token"');
  expect(await refused.json()).toEqual({ error: { code: "mcp.badToken" } });
});

const client = accounts.client;
const shotFiles = (appId: string, slot: number) => [
  path.join(settings.dataDir, client.username, "nxi", appId, String(slot)),
  path.join(settings.dataDir, client.username, "thumb", appId, String(slot)),
  path.join(settings.assetDir, "screenshots", appId, `${slot}.png`),
];

test("each write tool makes the change its API call makes, with the same answer and the same errors", async ({ page }) => {
  const key = await makeApiKey(page);
  const owner = await userByUsername(client.username);
  const categories = (await signedJson(page.request, key, "GET", "/api/categories")).body.categories as { id: number }[];
  const [first, second] = categories.map((category) => category.id);
  const other = await insertUser(`e2emcp${Date.now().toString(36)}`.slice(0, 16));
  const [needB, needC, gone] = (
    await Promise.all(["Needed B", "Needed C", "Gone"].map((label) => insertApp(other, uniqueTitle(label))))
  ).sort();
  await markAppDeleted(gone);
  const notPublic = await insertApp(other, uniqueTitle("Not public"));
  const made: string[] = [];
  const { accessToken } = await connectMcpClient(page, `E2E MCP write ${Date.now().toString(36)}`);
  const mcp = await mcpClient(accessToken, ERAS[0]);
  try {
    await setUserAppLimit(owner.id, (await liveAppIdsOf(owner.id)).length + 2);
    const tool = (name: string, args: Record<string, unknown>) => callJson(mcp, name, args);
    const api = (method: string, apiPath: string, body?: unknown) => signedJson(page.request, key, method, apiPath, body);
    // The tool on app a and the API call on app b: a success gives the same body, an error the same problem.
    const same = async (
      name: string,
      args: (id: string) => Record<string, unknown>,
      method: string,
      apiPath: (id: string) => string,
      body: unknown,
      ids: [string, string],
    ) => {
      const byTool = await tool(name, args(ids[0]));
      const byApi = await api(method, apiPath(ids[1]), body);
      if (byApi.status < 300) {
        expect(byTool, name).toEqual({ isError: false, body: byApi.body });
      } else {
        expect(byTool, name).toEqual(toolProblem(byApi.body.error as Problem));
      }
      return byTool;
    };

    const fields = { description: "Made by MCP\r\nand the API", installDir: "apps\\mcp\\", minCore: "3.1.10", categories: [first] };
    const titleA = uniqueTitle("MCP write");
    const created = await tool("create_app", { title: titleA, ...fields });
    expect(created).toEqual({ isError: false, body: { id: expect.stringMatching(/^[0-9a-z]{6}$/) } });
    const a = created.body.id as string;
    made.push(a);
    const byApi = await api("POST", "/api/apps", { title: uniqueTitle("MCP API"), ...fields });
    expect(byApi.status).toBe(201);
    expect(Object.keys(byApi.body)).toEqual(Object.keys(created.body));
    const b = byApi.body.id as string;
    made.push(b);
    const pair: [string, string] = [a, b];
    for (const id of pair) {
      expect(await appRow(id)).toMatchObject({
        user_id: owner.id,
        description: "Made by MCP\nand the API",
        install_dir: "/apps/mcp",
        deleted_at: null,
      });
      expect(await appCategoryIds(id)).toEqual([first]);
      expect(await appMinCore(id)).toBe(0x03010a);
    }
    expect(await tool("get_app", { id: a })).toMatchObject({ isError: false, body: { minCore: "3.01.10" } });
    expect((await tool("get_app", { id: a })).body).toEqual((await api("GET", `/api/apps/${a}`)).body);
    expect((await appRow(a)).title).toBe(titleA);
    expect(await tool("create_app", { ...fields, title: "" })).toEqual(toolProblem({ code: "title.length", min: 1, max: 32 }));
    expect(await tool("create_app", { ...fields, title: titleA, minCore: "3.01" })).toEqual(
      toolProblem({ code: "minCore.format" }),
    );
    expect(await tool("create_app", { ...fields, title: titleA, minCore: "3.16.00" })).toEqual(
      toolProblem({ code: "minCore.range" }),
    );
    expect(await tool("create_app", { ...fields, title: titleA, categories: [] })).toEqual(
      toolProblem({ code: "category.missing" }),
    );

    const appPath = (id: string) => `/api/apps/${id}`;
    const edit = { title: uniqueTitle("MCP edited"), description: "", categories: [second, first] };
    await same("update_app", (id) => ({ id, ...edit }), "PUT", appPath, edit, pair);
    for (const id of pair) {
      expect(await appRow(id)).toMatchObject({ title: edit.title, description: "" });
      expect(await appCategoryIds(id)).toEqual([first, second].sort((x, y) => x - y));
      expect((await appRow(id)).install_dir, "a missing installDir is set from the categories").not.toBe("/apps/mcp");
      expect(await appMinCore(id), "a missing minCore removes the minimum").toBeNull();
    }
    const withCore = { ...edit, minCore: "2.00.28" };
    await same("update_app", (id) => ({ id, ...withCore }), "PUT", appPath, withCore, pair);
    for (const id of pair) {
      expect(await appMinCore(id)).toBe(0x02001c);
    }
    const badCore = { ...edit, minCore: "3.01.256" };
    expect(await same("update_app", (id) => ({ id, ...badCore }), "PUT", appPath, badCore, pair)).toEqual(
      toolProblem({ code: "minCore.range" }),
    );
    for (const id of pair) {
      expect(await appMinCore(id), "a refused edit changes nothing").toBe(0x02001c);
    }
    const unlisted = { ...edit, visibility: "unlisted" };
    await same("update_app", (id) => ({ id, ...unlisted }), "PUT", appPath, unlisted, pair);
    for (const id of pair) {
      expect(await appRow(id)).toMatchObject({ visibility: "unlisted" });
    }
    expect(await tool("get_app", { id: a })).toMatchObject({ isError: false, body: { visibility: "unlisted" } });
    const badVisibility = { ...edit, visibility: "private" };
    expect(await same("update_app", (id) => ({ id, ...badVisibility }), "PUT", appPath, badVisibility, pair)).toEqual(
      toolProblem({ code: "visibility.unknown" }),
    );
    await same("update_app", (id) => ({ id, ...edit, minCore: "" }), "PUT", appPath, { ...edit, minCore: "" }, pair);
    for (const id of pair) {
      expect(await appRow(id), "a missing visibility is listed").toMatchObject({ visibility: "listed" });
    }
    expect((await appRow(a)).install_dir).toBe((await appRow(b)).install_dir);
    const banned = { ...edit, installDir: "/dot/x" };
    expect(await same("update_app", (id) => ({ id, ...banned }), "PUT", appPath, banned, pair)).toEqual(
      toolProblem({ code: "installDir.banned" }),
    );
    expect(await tool("update_app", { id: "not-an-id", ...edit })).toEqual(toolProblem({ code: "app.notFound" }));

    const dependsPath = (id: string) => `/api/apps/${id}/depends`;
    const depends = { depends: [needC, needB.toUpperCase(), needC] };
    await same("set_depends", (id) => ({ id, ...depends }), "PUT", dependsPath, depends, pair);
    for (const id of pair) {
      expect(await dependsOf(id)).toEqual([needB, needC]);
    }
    const unknown = { depends: [needB, gone, "zz"] };
    expect(await same("set_depends", (id) => ({ id, ...unknown }), "PUT", dependsPath, unknown, pair)).toEqual(
      toolProblem({ code: "depends.unknown", names: [gone, "zz"] }),
    );
    expect(await tool("set_depends", { id: a, depends: [a] })).toEqual(toolProblem({ code: "depends.self" }));
    expect(await dependsOf(a)).toEqual([needB, needC]);

    const republishPath = (id: string) => `/api/apps/${id}/republish`;
    const first10 = { version: "1.0" };
    expect(await same("republish_app", (id) => ({ id, ...first10 }), "POST", republishPath, first10, pair)).toEqual(
      toolProblem({ code: "release.notFound" }),
    );
    const zip = makeZip(sampleEntries());
    for (const id of pair) {
      const uploaded = await signedFetch(page.request, key, `/api/apps/${id}/releases`, {
        method: "POST",
        multipart: { version: "1.0", file: { name: "game.zip", mimeType: "application/zip", buffer: zip } },
      });
      expect(uploaded.status()).toBe(201);
    }
    expect(await same("republish_app", (id) => ({ id, ...first10 }), "POST", republishPath, first10, pair)).toEqual(
      toolProblem({ code: "version.taken" }),
    );
    const again = { version: "1.1", changelog: "Again." };
    expect(await same("republish_app", (id) => ({ id, ...again }), "POST", republishPath, again, pair)).toEqual({
      isError: false,
      body: { serial: 2, dotMoves: [] },
    });
    for (const id of pair) {
      expect(await releaseRow(id, 2)).toMatchObject({ version: "1.1", release_date: todayUtc(), changelog: "Again.", deleted_at: null });
      expect(readFileSync(releaseFile(client.username, id, 2)).equals(zip)).toBe(true);
    }

    const changelogPath = (id: string) => `/api/apps/${id}/releases/1/changelog`;
    const log = { changelog: "Fixed.\nMore." };
    await same("set_changelog", (id) => ({ id, serial: 1, ...log }), "PUT", changelogPath, log, pair);
    const tab = { changelog: "one\ttwo" };
    expect(await same("set_changelog", (id) => ({ id, serial: "1", ...tab }), "PUT", changelogPath, tab, pair)).toEqual(
      toolProblem({ code: "changelog.invalidCharacters", chars: ["\t"] }),
    );
    for (const id of pair) {
      expect((await releaseRow(id, 1))?.changelog).toBe("Fixed.\nMore.");
    }
    expect(await tool("set_changelog", { id: a, serial: 99, changelog: "" })).toEqual(toolProblem({ code: "release.notFound" }));

    for (const id of pair) {
      const shot = await signedFetch(page.request, key, `/api/apps/${id}/screenshots/2`, {
        method: "PUT",
        multipart: { file: { name: "shot.nxi", mimeType: "application/octet-stream", buffer: readyNxi(256) } },
      });
      expect(shot.status()).toBe(200);
    }
    const shotPath = (id: string) => `/api/apps/${id}/screenshots/2`;
    await same("delete_screenshot", (id) => ({ id, slot: 2 }), "DELETE", shotPath, undefined, pair);
    for (const id of pair) {
      expect(await screenshotRows(id)).toEqual([]);
      for (const file of shotFiles(id, 2)) {
        expect(existsSync(file), file).toBe(false);
      }
    }
    for (const slot of [2, 0, 6, "x"]) {
      expect(await tool("delete_screenshot", { id: a, slot }), `slot ${slot}`).toEqual(
        toolProblem({ code: "screenshot.notFound" }),
      );
    }

    const releasePath = (id: string) => `/api/apps/${id}/releases/2`;
    await same("delete_release", (id) => ({ id, serial: 2 }), "DELETE", releasePath, undefined, pair);
    for (const id of pair) {
      expect((await releaseRow(id, 2))?.deleted_at).not.toBeNull();
      expect(existsSync(releaseFile(client.username, id, 2))).toBe(false);
      expect(existsSync(binFile(id, 2))).toBe(true);
    }
    expect(await same("delete_release", (id) => ({ id, serial: 2 }), "DELETE", releasePath, undefined, pair)).toEqual(
      toolProblem({ code: "release.notFound" }),
    );

    const savedPath = (id: string) => `/api/saved/${id}`;
    await same("save_app", (id) => ({ id }), "PUT", savedPath, undefined, pair);
    for (const id of pair) {
      expect(await isSaved(owner.id, id)).toBe(true);
    }
    expect(await same("save_app", () => ({ id: notPublic }), "PUT", () => savedPath(notPublic), undefined, pair)).toEqual(
      toolProblem({ code: "app.notFound" }),
    );
    expect(await isSaved(owner.id, notPublic)).toBe(false);
    await same("unsave_app", (id) => ({ id }), "DELETE", savedPath, undefined, pair);
    for (const id of pair) {
      expect(await isSaved(owner.id, id)).toBe(false);
    }
    expect(await tool("unsave_app", { id: a }), "an app that is not saved").toEqual({ isError: false, body: {} });

    // Another user's app is app.notFound to every tool that changes an app.
    const notMine = toolProblem({ code: "app.notFound" });
    expect(await tool("update_app", { id: needB, ...edit })).toEqual(notMine);
    expect(await tool("set_depends", { id: needB, depends: [] })).toEqual(notMine);
    expect(await tool("republish_app", { id: needB, version: "9.9" })).toEqual(notMine);
    expect(await tool("set_changelog", { id: needB, serial: 1, changelog: "" })).toEqual(notMine);
    expect(await tool("delete_release", { id: needB, serial: 1 })).toEqual(notMine);
    expect(await tool("delete_screenshot", { id: needB, slot: 1 })).toEqual(notMine);
    expect(await tool("delete_app", { id: needB })).toEqual(notMine);
    expect(await appRow(needB)).toMatchObject({ deleted_at: null });

    await same("delete_app", (id) => ({ id }), "DELETE", appPath, undefined, pair);
    for (const id of pair) {
      expect((await appRow(id)).deleted_at).not.toBeNull();
      expect(existsSync(releaseFile(client.username, id, 1))).toBe(false);
    }
    expect(await same("delete_app", (id) => ({ id }), "DELETE", appPath, undefined, pair)).toEqual(notMine);
  } finally {
    await mcp.close();
    await setUserAppLimit(owner.id, owner.app_limit);
    await removeApps(made);
    await removeTestUser(other);
  }
});

type UploadUrl = { url: string; expiresAt: string; method: string; fields: Record<string, string>; curl: string };

test("upload_release and upload_screenshot give one-time URLs that answer as the API does", async ({ page, playwright }) => {
  const key = await makeApiKey(page);
  const owner = await userByUsername(client.username);
  const [category] = (await signedJson(page.request, key, "GET", "/api/categories")).body.categories as { id: number }[];
  const pair: string[] = [];
  const other = await insertUser(`e2eup${Date.now().toString(36)}`.slice(0, 16));
  const notMine = await insertApp(other, uniqueTitle("Not mine"));
  // A request context with no cookies, as curl has none.
  const bare = await playwright.request.newContext();
  const scratch = mkdtempSync(path.join(tmpdir(), "spun-e2e-upload-"));
  const { clientId, accessToken } = await connectMcpClient(page, `E2E MCP upload ${Date.now().toString(36)}`);
  const mcp = await mcpClient(accessToken, ERAS[0]);
  try {
    await setUserAppLimit(owner.id, (await liveAppIdsOf(owner.id)).length + 2);
    for (const label of ["MCP upload", "MCP upload API"]) {
      const made = await signedJson(page.request, key, "POST", "/api/apps", { title: uniqueTitle(label), categories: [category.id] });
      expect(made.status).toBe(201);
      pair.push(made.body.id as string);
    }
    const [a, b] = pair;
    const ticket = async (name: string, args: Record<string, unknown>) => {
      const before = Date.now();
      const result = await callJson(mcp, name, args);
      expect(result.isError, JSON.stringify(result.body)).toBe(false);
      const body = result.body as UploadUrl;
      expect(body.url).toMatch(new RegExp(`^${ORIGIN}/upload/[A-Za-z0-9_-]{43}$`));
      expect(body.method).toBe("POST");
      expect(body.curl).toContain(`'${body.url}'`);
      const expires = Date.parse(body.expiresAt);
      expect(expires).toBeGreaterThanOrEqual(before + MCP_UPLOAD_TICKET_SECONDS * 1000 - 1000);
      expect(expires).toBeLessThanOrEqual(Date.now() + MCP_UPLOAD_TICKET_SECONDS * 1000 + 1000);
      return body;
    };
    const post = async (url: string, multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) => {
      const response = await bare.post(url, { multipart });
      return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
    };
    const viaApi = async (method: string, apiPath: string, multipart: Parameters<typeof post>[1]) => {
      const response = await signedFetch(page.request, key, apiPath, { method, multipart });
      return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
    };
    const badTicket = { status: 404, body: { error: { code: "upload.badTicket" } } };

    const zip = makeZip(sampleEntries());
    const zipFile = { file: { name: "game.zip", mimeType: "application/zip", buffer: zip } };
    const releaseForm = { version: "1.0", changelog: "First.", ...zipFile };
    const release = await ticket("upload_release", { id: a.toUpperCase(), version: "1.0", changelog: "First." });
    expect(Object.keys(release.fields)).toEqual(["file"]);
    expect(release.curl).toBe(`curl -sS -F 'file=@ZIP_PATH' '${release.url}'`);
    const uploaded = await post(release.url, zipFile);
    expect(uploaded).toEqual({ status: 201, body: { serial: 1, dotMoves: [] } });
    expect(await viaApi("POST", `/api/apps/${b}/releases`, releaseForm)).toEqual(uploaded);
    for (const id of pair) {
      expect(readFileSync(releaseFile(client.username, id, 1)).equals(zip)).toBe(true);
      expect(await releaseRow(id, 1)).toMatchObject({ version: "1.0", release_date: todayUtc(), changelog: "First.", deleted_at: null });
    }
    expect(await post(release.url, zipFile), "a second use").toEqual(badTicket);
    expect(await releaseRow(a, 2)).toBeUndefined();

    // The tool checks the text as the upload does, and gives no URL for text the upload would refuse.
    for (const [args, code] of [
      [{}, "version.length"],
      [{ version: "1 0" }, "version.invalidCharacters"],
      [{ version: "1.1", releaseDate: "2001-02-30" }, "releaseDate.invalid"],
      [{ version: "1.1", releaseDate: "2999-01-01" }, "releaseDate.future"],
      [{ version: "1.1", changelog: "Caf\u00e9" }, "changelog.invalidCharacters"],
      [{ version: "1.1", changelog: "x".repeat(CHANGELOG_MAX + 1) }, "changelog.length"],
    ] as const) {
      const checked = await callJson(mcp, "upload_release", { id: a, ...args });
      expect(checked.isError, code).toBe(true);
      expect((checked.body.error as Problem).code).toBe(code);
      const api = await viaApi("POST", `/api/apps/${b}/releases`, { ...args, ...zipFile });
      expect(checked.body.error, `${code} as the API gives it`).toEqual(api.body.error);
    }

    // A refused upload uses the URL up too, and gives the API's error.
    const refused = await ticket("upload_release", { id: a, version: "1.0" });
    const taken = await post(refused.url, zipFile);
    expect(taken).toEqual({ status: 400, body: { error: { code: "version.taken" } } });
    expect(await viaApi("POST", `/api/apps/${b}/releases`, releaseForm)).toEqual(taken);
    expect(await post(refused.url, zipFile)).toEqual(badTicket);
    expect(await releaseRow(a, 2)).toBeUndefined();

    const shotForm = { file: { name: "shot.nxi", mimeType: "application/octet-stream", buffer: readyNxi(256) } };
    const shot = await ticket("upload_screenshot", { id: a, slot: 2 });
    expect(Object.keys(shot.fields)).toEqual(["file"]);
    const shotDone = await post(shot.url, shotForm);
    expect(shotDone).toEqual({ status: 200, body: { slot: 2, width: 256 } });
    expect(await viaApi("PUT", `/api/apps/${b}/screenshots/2`, shotForm)).toEqual(shotDone);
    for (const id of pair) {
      expect((await screenshotRows(id)).map((row) => ({ slot: row.slot, width: row.width }))).toEqual([{ slot: 2, width: 256 }]);
      expect(readFileSync(shotFiles(id, 2)[0]).equals(readyNxi(256))).toBe(true);
    }
    expect(await post(shot.url, shotForm), "a second use").toEqual(badTicket);

    // The curl command the tool gives, as an agent runs it.
    const png = path.join(scratch, "title.png");
    writeFileSync(png, await stripesPng(512, 384));
    const byCurl = await ticket("upload_screenshot", { id: a, slot: "1" });
    const answer = execFileSync("sh", ["-c", byCurl.curl.replace("IMAGE_PATH", png)], { encoding: "utf8" });
    expect(JSON.parse(answer)).toEqual({ slot: 1, width: 256 });
    for (const file of shotFiles(a, 1)) {
      expect(existsSync(file), file).toBe(true);
    }

    for (const name of ["upload_release", "upload_screenshot"]) {
      expect(await callJson(mcp, name, { id: notMine, slot: 1 }), `${name}, another user's app`).toEqual(
        toolProblem({ code: "app.notFound" }),
      );
      expect(await callJson(mcp, name, { id: "not-an-id", slot: 1 }), `${name}, a bad id`).toEqual(
        toolProblem({ code: "app.notFound" }),
      );
    }
    for (const slot of [0, 6, "x"]) {
      expect(await callJson(mcp, "upload_screenshot", { id: a, slot }), `slot ${slot}`).toEqual(
        toolProblem({ code: "screenshot.notFound" }),
      );
    }
    expect(await post(`${ORIGIN}/upload/${"A".repeat(43)}`, releaseForm), "an unknown token").toEqual(badTicket);

    // The user's state is checked when the URL is used, not only when it is made.
    const late = await ticket("upload_release", { id: a, version: "2.0" });
    await setUserDisabled(owner.id, true);
    try {
      expect(await post(late.url, zipFile)).toEqual(badTicket);
    } finally {
      await setUserDisabled(owner.id, false);
    }
    expect(await releaseRow(a, 2)).toBeUndefined();
    expect(await post(late.url, zipFile), "used up by the refusal").toEqual(badTicket);

    // The release gets the text given to the tool; text fields sent with the file change nothing.
    const historic = await ticket("upload_release", { id: a, version: "2.0", releaseDate: "2001-02-03", changelog: "Old one." });
    expect(await post(historic.url, { ...releaseForm, version: "9.9", releaseDate: "", changelog: "Other." })).toEqual({
      status: 201,
      body: { serial: 2, dotMoves: [] },
    });
    expect(await releaseRow(a, 2)).toMatchObject({ version: "2.0", release_date: "2001-02-03", changelog: "Old one." });

    // The release curl command, as an agent runs it.
    const zipPath = path.join(scratch, "game.zip");
    writeFileSync(zipPath, zip);
    const releaseCurl = await ticket("upload_release", { id: a, version: "3.0" });
    const curled = execFileSync("sh", ["-c", releaseCurl.curl.replace("ZIP_PATH", zipPath)], { encoding: "utf8" });
    expect(JSON.parse(curled)).toEqual({ serial: 3, dotMoves: [] });
    expect(await releaseRow(a, 3)).toMatchObject({ version: "3.0", release_date: todayUtc(), changelog: null });

    // A URL stops working when the user disconnects the client that got it.
    const orphan = await ticket("upload_release", { id: a, version: "4.0" });
    const orphanShot = await ticket("upload_screenshot", { id: a, slot: 3 });
    await markGrantDeleted((await grantRowsOfClient(clientId))[0].id);
    expect(await post(orphan.url, zipFile)).toEqual(badTicket);
    expect(await post(orphanShot.url, shotForm)).toEqual(badTicket);
    expect(await releaseRow(a, 4)).toBeUndefined();
    expect((await screenshotRows(a)).map((row) => row.slot)).not.toContain(3);
  } finally {
    await mcp.close();
    await setUserAppLimit(owner.id, owner.app_limit);
    await bare.dispose();
    rmSync(scratch, { recursive: true, force: true });
    await removeApps([...pair, notMine]);
    await removeTestUser(other);
  }
});
