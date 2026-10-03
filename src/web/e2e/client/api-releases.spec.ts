import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { makeApiKey, signedFetch, signedJson, type ApiKey } from "../support/api";
import { insertApp, insertUser, releaseRow, removeApps, removeTestUser } from "../support/db";
import { binFile, expect, fileSize, releaseFile, test, todayUtc, uniqueTitle } from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries } from "../support/zips";

const client = accounts.client;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function createApp(page: Page, key: ApiKey): Promise<string> {
  const categories = await signedJson(page.request, key, "GET", "/api/categories");
  const [category] = categories.body.categories as { id: number }[];
  const made = await signedJson(page.request, key, "POST", "/api/apps", {
    title: uniqueTitle("API release"),
    description: "",
    categories: [category.id],
  });
  expect(made.status).toBe(201);
  return made.body.id as string;
}

async function upload(page: Page, key: ApiKey, appId: string, fields: Record<string, string>, zip: Buffer) {
  const response = await signedFetch(page.request, key, `/api/apps/${appId}/releases`, {
    method: "POST",
    multipart: { ...fields, file: { name: "game.zip", mimeType: "application/zip", buffer: zip } },
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

const notFound = (code: string) => ({ status: 404, body: { error: { code } } });

test("upload, read, edit the changelog of and delete a release through the API", async ({ page }) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  try {
    const zip = makeZip(sampleEntries());
    expect(await upload(page, key, id, { version: "1.0", changelog: "First." }, zip)).toEqual({
      status: 201,
      body: { serial: 1, dotMoves: [] },
    });
    expect(fileSize(releaseFile(client.username, id, 1))).toBe(zip.length);
    expect(await releaseRow(id, 1)).toMatchObject({
      version: "1.0",
      release_date: todayUtc(),
      changelog: "First.",
      deleted_at: null,
    });
    expect(await signedJson(page.request, key, "GET", `/api/apps/${id}/releases/1`)).toEqual({
      status: 200,
      body: {
        appTitle: expect.stringMatching(/^E2E API release /),
        serial: 1,
        version: "1.0",
        releaseDate: todayUtc(),
        changelog: "First.",
        deletedDay: null,
        path: `/${client.username}/${id}-0001.zip`,
        files: sampleEntries().map((entry) => entry.name),
        dotMoves: [],
      },
    });

    const historic = await upload(page, key, id, { version: "0.9", releaseDate: "2020-05-17" }, makeZip(sampleEntries()));
    expect(historic).toEqual({ status: 201, body: { serial: 2, dotMoves: [] } });
    expect((await releaseRow(id, 2))?.release_date).toBe("2020-05-17");

    const taken = await upload(page, key, id, { version: "1.0" }, makeZip(sampleEntries()));
    expect(taken).toEqual({ status: 400, body: { error: { code: "version.taken" } } });
    expect(await releaseRow(id, 3)).toBeUndefined();

    const changelog = `/api/apps/${id}/releases/1/changelog`;
    expect(await signedJson(page.request, key, "PUT", changelog, { changelog: "Fixed.\nMore." })).toEqual({
      status: 200,
      body: {},
    });
    expect((await releaseRow(id, 1))?.changelog).toBe("Fixed.\nMore.");
    const bad = await signedJson(page.request, key, "PUT", changelog, { changelog: "one\ttwo" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: "changelog.invalidCharacters" });
    expect((await releaseRow(id, 1))?.changelog).toBe("Fixed.\nMore.");

    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${id}/releases/2`)).toEqual({
      status: 200,
      body: {},
    });
    expect(existsSync(releaseFile(client.username, id, 2))).toBe(false);
    expect(existsSync(binFile(id, 2))).toBe(true);
    expect((await releaseRow(id, 2))?.deleted_at).not.toBeNull();
    const deleted = await signedJson(page.request, key, "GET", `/api/apps/${id}/releases/2`);
    expect(deleted.body).toMatchObject({ serial: 2, deletedDay: expect.any(String), files: null });

    // A deleted release and one that never was are both release.notFound.
    for (const serial of [2, 99]) {
      const put = await signedJson(page.request, key, "PUT", `/api/apps/${id}/releases/${serial}/changelog`, {
        changelog: "Too late.",
      });
      expect(put, `changelog ${serial}`).toEqual(notFound("release.notFound"));
      const del = await signedJson(page.request, key, "DELETE", `/api/apps/${id}/releases/${serial}`);
      expect(del, `delete ${serial}`).toEqual(notFound("release.notFound"));
    }
    expect((await releaseRow(id, 2))?.changelog).toBeNull();
    expect(await signedJson(page.request, key, "GET", `/api/apps/${id}/releases/99`)).toEqual(
      notFound("release.notFound"),
    );
  } finally {
    await removeApps([id]);
  }
});

test("the API refuses a zip the Next cannot unzip, one with bad names and one over 4 MB, and stores nothing", async ({ page }) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  try {
    const incompatible = makeZip([{ name: "GAME/A:B.TXT", data: Buffer.from("a") }]);
    expect(await upload(page, key, id, { version: "1.0" }, incompatible)).toEqual({
      status: 400,
      body: { error: { code: "file.incompatible" } },
    });
    const badNames = makeZip([...sampleEntries(), { name: "WHAT?.TXT", data: Buffer.from("a") }]);
    expect(await upload(page, key, id, { version: "1.0" }, badNames)).toEqual({
      status: 400,
      body: { error: { code: "file.badNames", names: ["WHAT?.TXT"] } },
    });
    const big = makeZip([{ name: "BIG.BIN", data: Buffer.alloc(MAX_UPLOAD_BYTES) }]);
    expect(await upload(page, key, id, { version: "1.0" }, big)).toEqual({
      status: 400,
      body: { error: { code: "file.tooLarge" } },
    });
    expect(await releaseRow(id, 1)).toBeUndefined();
    expect(existsSync(releaseFile(client.username, id, 1))).toBe(false);
  } finally {
    await removeApps([id]);
  }
});

test("the API names each root .dot file it will move, and refuses a dot command the Next already has", async ({
  page,
}) => {
  const key = await makeApiKey(page);
  const id = await createApp(page, key);
  try {
    const clash = makeZip([
      ...sampleEntries(),
      { name: "Ls.Dot", data: Buffer.from("a") },
      { name: "mine.dot", data: Buffer.from("b") },
    ]);
    expect(await upload(page, key, id, { version: "1.0" }, clash)).toEqual({
      status: 400,
      body: { error: { code: "file.dotCommandTaken", names: ["Ls"] } },
    });
    expect(await releaseRow(id, 1)).toBeUndefined();
    expect(existsSync(releaseFile(client.username, id, 1))).toBe(false);

    const moves = [
      { file: "spun.dot", to: "C:/dot/spun" },
      { file: "TOOL.DOT", to: "C:/dot/TOOL" },
    ];
    const zip = makeZip([
      ...sampleEntries(),
      { name: "spun.dot", data: Buffer.from("a") },
      { name: "TOOL.DOT", data: Buffer.from("b") },
      { name: "BIN/LS.DOT", data: Buffer.from("c") },
    ]);
    expect(await upload(page, key, id, { version: "1.0" }, zip)).toEqual({
      status: 201,
      body: { serial: 1, dotMoves: moves },
    });
    const read = await signedJson(page.request, key, "GET", `/api/apps/${id}/releases/1`);
    expect(read.body.dotMoves).toEqual(moves);
  } finally {
    await removeApps([id]);
  }
});

test("another user's app is app.notFound for each release call, and an upload to an unknown app", async ({
  page,
}) => {
  const key = await makeApiKey(page);
  const other = await insertUser(`e2erel${Date.now().toString(36)}`.slice(0, 16));
  try {
    const app = await insertApp(other, "E2E other user's app");
    expect(await upload(page, key, app, { version: "1.0" }, makeZip(sampleEntries()))).toEqual(
      notFound("app.notFound"),
    );
    expect(await releaseRow(app, 1)).toBeUndefined();
    expect(await upload(page, key, "zzzzzz", { version: "1.0" }, makeZip(sampleEntries()))).toEqual(
      notFound("app.notFound"),
    );
    expect(await signedJson(page.request, key, "GET", `/api/apps/${app}/releases/1`)).toEqual(
      notFound("app.notFound"),
    );
    expect(
      await signedJson(page.request, key, "PUT", `/api/apps/${app}/releases/1/changelog`, { changelog: "" }),
    ).toEqual(notFound("app.notFound"));
    expect(await signedJson(page.request, key, "DELETE", `/api/apps/${app}/releases/1`)).toEqual(
      notFound("app.notFound"),
    );
  } finally {
    await removeTestUser(other);
  }
});
