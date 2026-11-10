import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { LOG_ROWS_MAX } from "../src/catalogue.js";
import { checksum, decodeDepends, decodeFind, decodeInfo } from "../src/codec.js";
import { fakeCatalogue, type Tables } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";

const BLOCK = 4096;
const zipBytes = Buffer.from("not really a zip");

// meta01 1 needs one live app; its latest release, 2, also names a deleted app and an unknown id.
const tables: Tables = {
  users: [{ id: "u1", username: "grouper" }],
  apps: [
    { id: "meta01", userId: "u1", title: "Group", description: "" },
    { id: "part01", userId: "u1", title: "Part one", description: "" },
    { id: "part02", userId: "u1", title: "Part two", description: "" },
    { id: "gone01", userId: "u1", title: "Gone", description: "", deleted: true },
    { id: "lone01", userId: "u1", title: "Alone", description: "" },
  ],
  releases: [
    { appId: "meta01", serial: 1, version: "1.0", releaseDate: "2026-11-01", depends: "part01" },
    { appId: "meta01", serial: 2, version: "1.1", releaseDate: "2026-11-02", depends: "part02 part01 gone01 nope99" },
    { appId: "meta01", serial: 3, version: "1.2", releaseDate: "2026-11-03", depends: "part01", deleted: true },
    { appId: "part01", serial: 1, version: "1.0", releaseDate: "2026-11-01" },
    { appId: "part02", serial: 1, version: "1.0", releaseDate: "2026-11-01" },
    { appId: "gone01", serial: 1, version: "1.0", releaseDate: "2026-11-01", depends: "part01" },
    { appId: "lone01", serial: 1, version: "1.0", releaseDate: "2026-11-01" },
  ],
  aliases: [{ alias: "group", appId: "meta01" }],
};

let dataDir: string;
let server: net.Server;
let port: number;
const clients: SpoofClient[] = [];

const connect = async (): Promise<SpoofClient> => {
  const client = await SpoofClient.connect(port);
  clients.push(client);
  return client;
};

const expectError = async (client: SpoofClient, command: string, code: string): Promise<void> => {
  client.send(command);
  assert.equal((await client.read(code.length + 2)).toString("latin1"), `${code}\r\n`);
};

// LOG sends nothing, so a later command's answer shows that the LOGs before it are done.
const answers = async (client: SpoofClient): Promise<void> => {
  client.send("SPFIND 1 group\n");
  assert.equal((await client.reply(decodeFind)).total, 1);
};

// A whole GET as .spun does it, of a zip of one short block.
const get = async (client: SpoofClient, name: string): Promise<void> => {
  client.send(`GET grouper/${name}\n`);
  await client.read(11 + name.length + 1);
  assert.ok(zipBytes.length < BLOCK);
  client.send("!\r\n");
  assert.deepEqual(await client.read(zipBytes.length + 1), Buffer.concat([zipBytes, Buffer.from([checksum(zipBytes)])]));
  client.send("!\r\n");
};

const baddeps = () => (tables.clientLog ?? []).filter((row) => row.name === "baddep").map((row) => row.value);

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spun-depends-"));
  mkdirSync(path.join(dataDir, "grouper"));
  writeFileSync(path.join(dataDir, "grouper", "meta01-0001.zip"), zipBytes);
  writeFileSync(path.join(dataDir, "grouper", "lone01-0001.zip"), zipBytes);
  ({ server, port } = await startSpunServer(fakeCatalogue(tables), dataDir));
});

after(() => {
  for (const client of clients) client.close();
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  tables.clientLog = [];
});

describe("SPINFO", () => {
  test("gives the dependency count of the latest live release, and none when it has none", async () => {
    const client = await connect();
    client.send("SPINFO group\n");
    assert.equal((await client.reply(decodeInfo)).app.dependsCount, 4);
    client.send("SPINFO lone01\n");
    assert.equal((await client.reply(decodeInfo)).app.dependsCount, 0);
  });
});

describe("SPDEPS", () => {
  test("lists the ids of one live release as stored, for an id or an alias", async () => {
    const client = await connect();
    client.send("SPDEPS META01 2\n");
    assert.deepEqual(await client.reply(decodeDepends), ["part02", "part01", "gone01", "nope99"]);
    client.send("SPDEPS group 1\n");
    assert.deepEqual(await client.reply(decodeDepends), ["part01"]);
    client.send("SPDEPS lone01 1\n");
    assert.deepEqual(await client.reply(decodeDepends), []);
  });

  test("a deleted or unknown release gives NoRelease_ERROR, an unknown app NoApp_ERROR, a bad serial BadQuery_ERROR", async () => {
    const client = await connect();
    for (const command of ["SPDEPS meta01 3", "SPDEPS meta01 9", "SPDEPS gone01 1"]) {
      await expectError(client, `${command}\n`, "NoRelease_ERROR");
    }
    for (const command of ["SPDEPS nope99 1", "SPDEPS"]) {
      await expectError(client, `${command}\n`, "NoApp_ERROR");
    }
    for (const command of ["SPDEPS meta01", "SPDEPS meta01 0", "SPDEPS meta01 x"]) {
      await expectError(client, `${command}\n`, "BadQuery_ERROR");
    }
    await answers(client);
  });
});

describe("LOG baddep", () => {
  test("is stored only for a dependency of the last SPDEPS release, once", async () => {
    const client = await connect();
    client.send("LOG baddep=nope99\n");
    await answers(client);
    assert.deepEqual(baddeps(), []);

    client.send("SPDEPS meta01 2\n");
    await client.reply(decodeDepends);
    client.send("LOG baddep=nope99\nLOG baddep=gone01\nLOG baddep=nope99\nLOG baddep=lone01\nLOG baddep=x\n");
    await answers(client);
    assert.deepEqual(baddeps(), ["nope99", "gone01"]);

    client.send("SPDEPS meta01 1\n");
    await client.reply(decodeDepends);
    client.send("LOG baddep=gone01\n");
    await answers(client);
    assert.deepEqual(baddeps(), ["nope99", "gone01"]);
  });

  test("a zip GET makes its release the last got one", async () => {
    const client = await connect();
    client.send("SPDEPS meta01 2\n");
    await client.reply(decodeDepends);
    await get(client, "lone01-0001.zip");
    client.send("LOG baddep=nope99\n");
    await answers(client);
    assert.deepEqual(baddeps(), []);

    await get(client, "meta01-0001.zip");
    client.send("LOG baddep=part01\n");
    await answers(client);
    assert.deepEqual(baddeps(), ["part01"]);
  });

  test(`does not count towards the ${LOG_ROWS_MAX} rows, and works after them`, async () => {
    const client = await connect();
    // The session queues at most 16 lines, so the LOGs go in batches.
    for (let batch = 0; batch < 4; batch++) {
      client.send(Array.from({ length: 5 }, (_, i) => `LOG version=${batch * 5 + i}\n`).join(""));
      await answers(client);
    }
    client.send("SPDEPS meta01 2\n");
    await client.reply(decodeDepends);
    client.send("LOG baddep=nope99\nLOG baddep=gone01\nLOG version=late\n");
    await answers(client);
    const rows = tables.clientLog ?? [];
    assert.equal(rows.filter((row) => row.name === "version").length, LOG_ROWS_MAX);
    assert.deepEqual(baddeps(), ["nope99", "gone01"]);
  });
});
