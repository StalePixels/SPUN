import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { LOG_ROWS_MAX, LOG_VALUE_MAX, parseLog, type Catalogue } from "../src/catalogue.js";
import { decodeFind } from "../src/codec.js";
import { fakeCatalogue, type Tables } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";

const tables: Tables = {
  users: [{ id: "u1", username: "logger" }],
  apps: [{ id: "log001", userId: "u1", title: "Zebra", description: "" }],
  releases: [{ appId: "log001", serial: 1, version: "1.0", releaseDate: "2026-10-07" }],
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

// LOG sends nothing, so a later command's answer shows that the LOGs before it are done,
// and that the session is still open.
const answers = async (client: SpoofClient): Promise<void> => {
  client.send("SPFIND 1 zebra\n");
  assert.equal((await client.reply(decodeFind)).total, 1);
  assert.equal(client.closed, false);
};

const rows = () => tables.clientLog ?? [];

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spun-log-"));
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

describe("parseLog", () => {
  test("splits at the first =, and lowercases the key", () => {
    assert.deepEqual(parseLog("Version=0.7.2"), { name: "version", value: "0.7.2" });
    assert.deepEqual(parseLog("a=b=c"), { name: "a", value: "b=c" });
    assert.deepEqual(parseLog("k_1.x-y="), { name: "k_1.x-y", value: "" });
  });

  test("refuses no =, an empty or bad key, and a key or value that is too long", () => {
    for (const text of ["", "version", "=x", "bad key=x", "ké=x", "k/1=x", `${"k".repeat(33)}=x`]) {
      assert.equal(parseLog(text), null, text);
    }
    assert.notEqual(parseLog(`${"k".repeat(32)}=${"v".repeat(LOG_VALUE_MAX)}`), null);
    assert.equal(parseLog(`k=${"v".repeat(LOG_VALUE_MAX + 1)}`), null);
  });
});

describe("LOG", () => {
  test("stores a row with the connection id and address, and sends no bytes", async () => {
    const client = await connect();
    client.send("LOG version=0.7.2\n");
    assert.equal((await client.drain(200)).length, 0);
    await answers(client);
    assert.equal(rows().length, 1);
    const [row] = rows();
    assert.equal(row.name, "version");
    assert.equal(row.value, "0.7.2");
    assert.equal(row.address, "127.0.0.1");
    assert.match(row.connectionId, /^[0-9a-f-]{36}$/);
  });

  test("keeps the spaces in a value", async () => {
    const client = await connect();
    client.send("LOG model=ZX Spectrum  Next KS2\n");
    await answers(client);
    assert.equal(rows()[0].value, "ZX Spectrum  Next KS2");
  });

  test("LOGs on one connection share an id; another connection has a different one", async () => {
    const first = await connect();
    first.send("LOG a=1\nLOG b=2\n");
    await answers(first);
    const second = await connect();
    second.send("LOG c=3\n");
    await answers(second);
    const [a, b, c] = rows();
    assert.equal(a.connectionId, b.connectionId);
    assert.notEqual(a.connectionId, c.connectionId);
  });

  test("a malformed LOG stores nothing, sends nothing and keeps the session", async () => {
    const client = await connect();
    client.send("LOG\nLOG version\nLOG =1\nLOG bad!key=1\nLOG version 0.7.2\n");
    assert.equal((await client.drain(200)).length, 0);
    await answers(client);
    assert.equal(rows().length, 0);
  });

  test(`stores at most ${LOG_ROWS_MAX} rows for one connection, and ignores the rest`, async () => {
    const client = await connect();
    // The session queues at most 16 lines, so the LOGs go in batches.
    for (let batch = 0; batch < 4; batch++) {
      client.send(Array.from({ length: 5 }, (_, i) => `LOG n=${batch * 5 + i}\n`).join(""));
      await answers(client);
    }
    assert.equal(rows().length, LOG_ROWS_MAX);
    assert.equal(rows().at(-1)?.value, String(LOG_ROWS_MAX - 1));
    assert.equal((await client.drain()).length, 0);
  });
});

describe("LOG with a database failure", () => {
  let failing: net.Server;
  let failingPort: number;

  before(async () => {
    const broken: Catalogue = {
      ...fakeCatalogue(tables),
      clientLog: () => Promise.reject(new Error("database down")),
    };
    ({ server: failing, port: failingPort } = await startSpunServer(broken, dataDir));
  });

  after(() => failing.close());

  test("sends nothing and keeps the session", async () => {
    const client = await SpoofClient.connect(failingPort);
    clients.push(client);
    client.send("LOG version=0.7.2\n");
    assert.equal((await client.drain(200)).length, 0);
    await answers(client);
  });
});
