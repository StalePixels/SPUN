import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import type { Catalogue } from "../src/catalogue.js";
import { checksum, decodeFind, decodeInfo } from "../src/codec.js";
import { fakeCatalogue, type AppRow, type ReleaseRow, type Tables } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";
import { hexString, settings } from "./settings.js";

const BLOCK = 4096;
const user = settings.publisher;

const pagerApps: AppRow[] = Array.from({ length: 45 }, (_, i) => ({
  id: `pg${String(i + 1).padStart(4, "0")}`,
  userId: "u2",
  title: `Pager ${String(i + 1).padStart(2, "0")}`,
  description: "",
}));

const pagerReleases: ReleaseRow[] = pagerApps.map((app) => ({
  appId: app.id,
  serial: 1,
  version: "1.0",
  releaseDate: "2026-09-26",
}));

// Pager titles with nothing to download: they must not change the paging.
const emptyPagers: AppRow[] = ["pgxx01", "pgxx02", "pgxx03"].map((id, i) => ({
  id,
  userId: "u2",
  title: `Pager 0${i}`,
  description: "",
}));

const longReleases: ReleaseRow[] = Array.from({ length: 150 }, (_, i) => ({
  appId: "long01",
  serial: i + 1,
  version: `1.${i + 1}`,
  releaseDate: "2026-09-26",
}));

const tables: Tables = {
  users: [
    { id: "u1", username: user },
    { id: "u2", username: settings.otherPublisher },
  ],
  apps: [
    { id: "tst001", userId: "u1", title: "Test App", description: "A test app" },
    { id: "tst002", userId: "u1", title: "Zebra", description: "Stripes" },
    { id: "empty1", userId: "u1", title: "Empty Shelf", description: "No releases here" },
    { id: "allgn1", userId: "u1", title: "All Gone", description: "" },
    { id: "gone01", userId: "u1", title: "Test App Gone", description: "", deleted: true },
    { id: "desc01", userId: "u2", title: "Other", description: "Made for Test App users" },
    { id: "abc123", userId: "u2", title: "Mixed Case Title", description: "" },
    { id: "long01", userId: "u2", title: "Long History", description: "" },
    ...pagerApps,
    ...emptyPagers,
  ],
  releases: [
    { appId: "tst001", serial: 1, version: "test-upload-01", releaseDate: "2026-09-25" },
    {
      appId: "tst001",
      serial: 2,
      version: "test-upload-02",
      releaseDate: "2026-09-26",
      deleted: true,
    },
    { appId: "abc123", serial: 1, version: "1.0", releaseDate: "2026-09-20" },
    { appId: "abc123", serial: 2, version: "1.1", releaseDate: "2026-09-21" },
    { appId: "abc123", serial: 3, version: "1.2", releaseDate: "2026-09-22", deleted: true },
    { appId: "desc01", serial: 1, version: "0.1", releaseDate: "2026-09-01" },
    { appId: "tst002", serial: 1, version: "1.0", releaseDate: "2026-09-01" },
    { appId: "allgn1", serial: 1, version: "1.0", releaseDate: "2026-09-01", deleted: true },
    { appId: "gone01", serial: 1, version: "1.0", releaseDate: "2026-09-20" },
    ...longReleases,
    ...pagerReleases,
  ],
};

// Two full blocks and a short last block.
const fileBytes = Buffer.from(Array.from({ length: 2 * BLOCK + 100 }, (_, i) => (i * 7) % 256));
const blockWithChecksum = (from: number, to: number): Buffer => {
  const block = fileBytes.subarray(from, to);
  return Buffer.concat([block, Buffer.from([checksum(block)])]);
};

let dataDir: string;
let server: net.Server;
let port: number;
let client: SpoofClient;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spun-socket-"));
  mkdirSync(path.join(dataDir, user));
  writeFileSync(path.join(dataDir, user, "tst001-0001.zip"), fileBytes);
  ({ server, port } = await startSpunServer(fakeCatalogue(tables), dataDir));
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const connect = async (): Promise<void> => {
  client = await SpoofClient.connect(port);
};

const expectError = async (command: string, code: string): Promise<void> => {
  client.send(command);
  assert.equal((await client.read(code.length + 2)).toString(), `${code}\r\n`);
};

// The session is still open and answers a command.
const expectOpen = async (): Promise<void> => {
  client.send("FIND 1 zebra\n");
  assert.equal((await client.reply(decodeFind)).total, 1);
  assert.equal(client.closed, false);
};

describe("FIND", () => {
  before(connect);
  after(() => client.close());

  test("sends the agreed bytes", async () => {
    client.send("FIND 1 zebra\n");
    // The block holds the username, so its size and checksum come from the body.
    const body =
      "747374303032" + // tst002
      hexString(user) + // username\0
      "5a6562726100" + // Zebra\0
      "0100" + // latest serial 1
      "312e3000"; // 1.0\0
    const length = body.length / 2;
    const sum = Buffer.from(body, "hex").reduce((total, byte) => total + byte, 0) % 256;
    const expected =
      "0201000100010100" + // version, total 1, page 1, 1 entry, 1 page
      Buffer.from([length & 255, length >> 8]).toString("hex") +
      body +
      sum.toString(16).padStart(2, "0");
    assert.equal((await client.read(expected.length / 2)).toString("hex"), expected);
    assert.equal((await client.drain()).length, 0);
  });

  test("matches title and description, ignoring case, sorted by title", async () => {
    client.send("FIND 1 tEsT aPp\x0A\x0D");
    const page = await client.reply(decodeFind);
    assert.deepEqual(
      page.apps.map((app) => app.id),
      ["desc01", "tst001"],
    );
    assert.deepEqual([page.total, page.page, page.pages], [2, 1, 1]);
  });

  test("does not list deleted apps", async () => {
    client.send("FIND 1 gone\n");
    const page = await client.reply(decodeFind);
    assert.deepEqual([page.total, page.pages, page.apps.length], [0, 0, 0]);
  });

  test("does not list apps with no release, or only deleted releases", async () => {
    for (const command of ["FIND 1 shelf", "FIND 1 all gone"]) {
      client.send(`${command}\n`);
      const page = await client.reply(decodeFind);
      assert.deepEqual([page.total, page.pages, page.apps.length], [0, 0, 0]);
    }
  });

  test("the latest serial skips deleted releases", async () => {
    client.send("FIND 1 mixed case\n");
    const page = await client.reply(decodeFind);
    assert.deepEqual(page.apps[0].latest, { serial: 2, version: "1.1" });
  });

  test("pages hold 20 entries", async () => {
    client.send("FIND 2 pager\n");
    const page2 = await client.reply(decodeFind);
    assert.deepEqual([page2.total, page2.page, page2.pages], [45, 2, 3]);
    assert.deepEqual(
      page2.apps.map((app) => app.title),
      Array.from({ length: 20 }, (_, i) => `Pager ${i + 21}`),
    );

    client.send("FIND 3 pager\n");
    assert.equal((await client.reply(decodeFind)).apps.length, 5);

    // Like DIR: a page past the end is empty, not an error.
    client.send("FIND 4 pager\n");
    const page4 = await client.reply(decodeFind);
    assert.deepEqual([page4.page, page4.pages, page4.apps.length], [4, 3, 0]);
  });

  test("bad page numbers and empty text give BadQuery_ERROR and keep the session", async () => {
    for (const command of ["FIND 0 spun", "FIND x spun", "FIND 65536 spun", "FIND 1", "FIND"]) {
      await expectError(`${command}\n`, "BadQuery_ERROR");
    }
    await expectOpen();
  });
});

describe("INFO", () => {
  before(connect);
  after(() => client.close());

  test("an app id in capitals sends the agreed bytes, without deleted releases", async () => {
    client.send("INFO TST001\n");
    const expected =
      "02" + hexString(user) + "5465737420417070004120746573742061707000" +
      "010001000101001c000100746573742d75706c6f61642d303100323032362d30392d323500f5";
    assert.equal((await client.read(expected.length / 2)).toString("hex"), expected);
    assert.equal((await client.drain()).length, 0);
  });

  test("lists releases newest first, 100 to a page", async () => {
    client.send("INFO long01\n");
    const page1 = await client.reply(decodeInfo);
    assert.deepEqual([page1.total, page1.page, page1.pages], [150, 1, 2]);
    assert.equal(page1.releases.length, 100);
    assert.deepEqual(page1.releases[0], { serial: 150, version: "1.150", date: "2026-09-26" });

    client.send("INFO long01 2\n");
    const page2 = await client.reply(decodeInfo);
    assert.equal(page2.releases.length, 50);
    assert.equal(page2.releases[0].serial, 50);
  });

  test("an app with no releases has an empty list", async () => {
    client.send("INFO empty1\n");
    const page = await client.reply(decodeInfo);
    assert.deepEqual(page.app, {
      username: user,
      title: "Empty Shelf",
      description: "No releases here",
    });
    assert.deepEqual([page.total, page.pages, page.releases.length], [0, 0, 0]);
  });

  test("unknown, deleted and malformed app ids give NoApp_ERROR and keep the session", async () => {
    for (const command of ["INFO zzzzzz", "INFO gone01", "INFO abc", "INFO"]) {
      await expectError(`${command}\n`, "NoApp_ERROR");
    }
    await expectOpen();
  });

  test("a bad page number gives BadQuery_ERROR and keeps the session", async () => {
    await expectError("INFO tst001 0\n", "BadQuery_ERROR");
    await expectOpen();
  });
});

describe("GET", () => {
  before(connect);
  after(() => client.close());

  test("block handshake, with a retry after a checksum failure", async () => {
    client.send(`GET ${user}/tst001-0001.zip\n`);
    const header = Buffer.concat([
      Buffer.from([2]),
      Buffer.from([0x64, 0x20, 0x00, 0x00]), // size 8292
      Buffer.from([0x02, 0x00, 0x00, 0x00]), // two full blocks
      Buffer.from([0x64, 0x00]), // 100 bytes in the last block
      Buffer.from("tst001-0001.zip\0"),
    ]);
    assert.deepEqual(await client.read(header.length), header);

    client.send("!1\r\n");
    assert.deepEqual(await client.read(BLOCK + 1), blockWithChecksum(0, BLOCK));

    // The client found a bad checksum and asks for the same block again.
    client.send("<\r\n");
    assert.deepEqual(await client.read(BLOCK + 1), blockWithChecksum(0, BLOCK));

    client.send("!\r\n");
    assert.deepEqual(await client.read(BLOCK + 1), blockWithChecksum(BLOCK, 2 * BLOCK));

    client.send("!\r\n");
    assert.deepEqual(await client.read(101), blockWithChecksum(2 * BLOCK, 2 * BLOCK + 100));

    // Acknowledge the last block; the session waits for a command again.
    client.send("!\r\n");
    assert.equal((await client.drain()).length, 0);
    await expectOpen();
  });

  test("a missing file gives NoFile_ERROR and keeps the session", async () => {
    await expectError(`GET ${user}/tst001-0002.zip\n`, "NoFile_ERROR");
    await expectOpen();
  });
});

describe("a database failure", () => {
  let failing: net.Server;
  let failingPort: number;

  before(async () => {
    const broken: Catalogue = {
      find: () => Promise.reject(new Error("database down")),
      app: () => Promise.reject(new Error("database down")),
      releases: () => Promise.reject(new Error("database down")),
    };
    ({ server: failing, port: failingPort } = await startSpunServer(broken, dataDir));
  });

  after(() => failing.close());

  test("gives ServerException_ERROR and ends the session, as the engine does", async () => {
    client = await SpoofClient.connect(failingPort);
    await expectError("FIND 1 spun\n", "ServerException_ERROR");
    await client.drain();
    assert.equal(client.closed, true);
    client.close();
  });
});

describe("lines sent together", () => {
  let slow: net.Server;
  let slowPort: number;

  // A slow database makes INFO finish after a DIR sent behind it, unless the
  // session handles DIR only after INFO has answered.
  before(async () => {
    const fast = fakeCatalogue(tables);
    const later = <T>(value: Promise<T>): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(value), 100));
    const delayed: Catalogue = {
      find: (...args) => later(fast.find(...args)),
      app: (...args) => later(fast.app(...args)),
      releases: (...args) => later(fast.releases(...args)),
    };
    ({ server: slow, port: slowPort } = await startSpunServer(delayed, dataDir));
  });

  after(() => slow.close());

  test("INFO then DIR in one write are answered in that order", async () => {
    client = await SpoofClient.connect(slowPort);
    try {
      client.send("DIR\n");
      await new Promise((resolve) => setTimeout(resolve, 200));
      const dir = await client.drain();
      assert.ok(dir.length > 0);

      client.send("INFO tst001\nDIR\n");
      const info =
        "02" + hexString(user) + "5465737420417070004120746573742061707000" +
        "010001000101001c000100746573742d75706c6f61642d303100323032362d30392d323500f5";
      assert.equal((await client.read(info.length / 2)).toString("hex"), info);
      assert.deepEqual(await client.read(dir.length), dir);
      assert.equal((await client.drain()).length, 0);
    } finally {
      client.close();
    }
  });
});
