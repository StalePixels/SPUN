import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fakeCatalogue, type Tables } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";
import { settings } from "./settings.js";

const BLOCK = 4096;
const user = settings.publisher;
const fileBytes = Buffer.alloc(3 * BLOCK + 10, 7);

const tables: Tables = {
  users: [{ id: "u1", username: user }],
  apps: [{ id: "lim001", userId: "u1", title: "Limits", description: "" }],
  releases: [{ appId: "lim001", serial: 1, version: "1.0", releaseDate: "2026-10-04" }],
};

let dataDir: string;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

before(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spun-limits-"));
  mkdirSync(path.join(dataDir, user));
  writeFileSync(path.join(dataDir, user, "lim001-0001.zip"), fileBytes);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

async function start(extra: Record<string, string>): Promise<{ server: net.Server; port: number }> {
  return startSpunServer(fakeCatalogue(tables), dataDir, extra);
}

// The server says nothing as it closes: an ESP8266 in passthrough mode would keep the
// text in the Next's UART until its next request.
async function closedSilently(client: SpoofClient, withinMs: number): Promise<void> {
  const deadline = Date.now() + withinMs;
  while (!client.closed && Date.now() < deadline) {
    await pause(50);
  }
  assert.equal(client.closed, true);
  assert.equal((await client.drain(0)).length, 0);
}


describe("the idle timeout", () => {
  let server: net.Server;
  let port: number;

  before(async () => {
    ({ server, port } = await start({ NBN_IDLE: "400" }));
  });

  after(() => server.close());

  test("closes a silent connection", async () => {
    const client = await SpoofClient.connect(port);
    await pause(200);
    assert.equal(client.closed, false);
    await closedSilently(client, 1000);
  });

  test("closes a connection that stops in the middle of a transfer", async () => {
    const client = await SpoofClient.connect(port);
    client.send(`GET ${user}/lim001-0001.zip\n`);
    await client.read(11 + "lim001-0001.zip".length + 1);
    client.send("!\r\n");
    await client.read(BLOCK + 1);
    await closedSilently(client, 1000);
  });

  test("never cuts off a slow client that answers each block within the timeout", async () => {
    const client = await SpoofClient.connect(port);
    client.send(`GET ${user}/lim001-0001.zip\n`);
    await client.read(11 + "lim001-0001.zip".length + 1);
    for (let block = 0; block < 4; block++) {
      await pause(250);
      client.send("!\r\n");
      await client.read(block < 3 ? BLOCK + 1 : 11);
    }
    await pause(250);
    client.send("!\r\n");
    await pause(250);
    client.send("SPINFO lim001\n");
    assert.ok((await client.read(4)).length === 4);
    assert.equal(client.closed, false);
    client.close();
  });
});

describe("the connection caps", () => {
  test("close a connection over the limit for one address at once, and take one again after a close", async () => {
    const { server, port } = await start({ NBN_MAXPERIP: "2" });
    try {
      const first = await SpoofClient.connect(port);
      const second = await SpoofClient.connect(port);
      await pause(100);
      const third = await SpoofClient.connect(port);
      await closedSilently(third, 300);
      first.close();
      await pause(100);
      const fourth = await SpoofClient.connect(port);
      fourth.send("SPINFO lim001\n");
      assert.equal((await fourth.read(1)).length, 1);
      second.close();
      fourth.close();
    } finally {
      server.close();
    }
  });

  test("close a connection over the total limit at once", async () => {
    const { server, port } = await start({ NBN_MAXCONNS: "2", NBN_MAXPERIP: "10" });
    try {
      const first = await SpoofClient.connect(port);
      const second = await SpoofClient.connect(port);
      await pause(100);
      const third = await SpoofClient.connect(port);
      await closedSilently(third, 300);
      first.close();
      second.close();
    } finally {
      server.close();
    }
  });

  test("default to a 10 minute timeout, 512 connections and 16 from one address", async () => {
    const { loadConfig } = await import("../../vendor/NBNtools/server/src/index.js");
    process.env.NBN_FILEPATH = dataDir;
    const config = loadConfig();
    assert.deepEqual([config.IDLE, config.MAXCONNS, config.MAXPERIP], [600000, 512, 16]);
  });
});
