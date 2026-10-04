import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import type { AppId, Catalogue } from "../src/catalogue.js";
import { checksum, decodeChangelog, decodeFind, decodeInfo } from "../src/codec.js";
import { fakeCatalogue, type AppRow, type ReleaseRow, type Tables } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";
import { ascii, counts, field, le, reply } from "./golden.js";
import { settings } from "./settings.js";

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
    {
      id: "abc123",
      userId: "u2",
      title: "Mixed Case Title",
      description: "",
      downloads: 12,
      categories: ["Tools", "Games"],
      screenshots: [
        { slot: 4, width: 256 },
        { slot: 1, width: 320 },
      ],
      installDir: "/apps/mixed",
    },
    {
      id: "long01",
      userId: "u2",
      title: "Long History",
      description: "",
      downloads: 70000,
      categories: Array.from({ length: 20 }, (_, i) => `Category ${String(20 - i).padStart(2, "0")}`),
    },
    ...pagerApps,
    ...emptyPagers,
  ],
  releases: [
    { appId: "tst001", serial: 1, version: "test-upload-01", releaseDate: "2026-09-25" },
    {
      appId: "tst001",
      serial: 2,
      version: "test-upload-02",
      releaseDate: "2026-09-30",
      deleted: true,
    },
    { appId: "abc123", serial: 1, version: "1.0", releaseDate: "2026-09-20" },
    {
      appId: "abc123",
      serial: 2,
      version: "1.1",
      releaseDate: "2026-09-21",
      changelog: "Faster.\nFewer bugs.",
    },
    { appId: "abc123", serial: 3, version: "1.2", releaseDate: "2026-09-22", deleted: true },
    { appId: "desc01", serial: 1, version: "0.1", releaseDate: "2026-09-01" },
    { appId: "tst002", serial: 1, version: "1.0", releaseDate: "2026-09-01" },
    { appId: "allgn1", serial: 1, version: "1.0", releaseDate: "2026-09-01", deleted: true },
    { appId: "gone01", serial: 1, version: "1.0", releaseDate: "2026-09-20" },
    ...longReleases,
    ...pagerReleases,
  ],
  aliases: [
    { alias: "testapp", appId: "tst001" },
    { alias: "my_app-2", appId: "tst002" },
    { alias: "gonealias", appId: "gone01" },
    { alias: "emptyalias", appId: "allgn1" },
    { alias: "promoted", appId: "tst001" },
  ],
};

// Two full blocks and a short last block.
const fileBytes = Buffer.from(Array.from({ length: 2 * BLOCK + 100 }, (_, i) => (i * 7) % 256));
const blockWithChecksum = (from: number, to: number): Buffer => {
  const block = fileBytes.subarray(from, to);
  return Buffer.concat([block, Buffer.from([checksum(block)])]);
};

// Exactly two blocks, so the last block has no data, only its checksum.
const exactBytes = Buffer.from(Array.from({ length: 2 * BLOCK }, (_, i) => (i * 13) % 256));

let dataDir: string;
let server: net.Server;
let port: number;
let client: SpoofClient;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "spun-socket-"));
  mkdirSync(path.join(dataDir, user));
  writeFileSync(path.join(dataDir, user, "tst001-0001.zip"), fileBytes);
  writeFileSync(path.join(dataDir, user, "tst002-0001.zip"), exactBytes);
  mkdirSync(path.join(dataDir, user, "nxi", "tst001"), { recursive: true });
  writeFileSync(path.join(dataDir, user, "nxi", "tst001", "1"), fileBytes);
  ({ server, port } = await startSpunServer(fakeCatalogue(tables), dataDir));
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// tst001 with its deleted release left out.
const TST001_INFO = reply(
  counts(1, 1, 1) +
    field(0x11, ascii("tst001")) +
    field(0x12, ascii(user)) +
    field(0x13, ascii("Test App")) +
    field(0x80, ascii("A test app")) +
    field(0x16, le(0, 4)) +
    field(0x18, field(0x14, le(1, 2)) + field(0x15, ascii("test-upload-01")) + field(0x17, ascii("2026-09-25"))),
);

const connect = async (): Promise<void> => {
  client = await SpoofClient.connect(port);
};

const expectError = async (command: string, code: string): Promise<void> => {
  client.send(command);
  assert.equal((await client.read(code.length + 2)).toString(), `${code}\r\n`);
};

// The session is still open and answers a command.
const expectOpen = async (): Promise<void> => {
  client.send("SPFIND 1 zebra\n");
  assert.equal((await client.reply(decodeFind)).total, 1);
  assert.equal(client.closed, false);
};

describe("SPFIND", () => {
  before(connect);
  after(() => client.close());

  test("sends the agreed bytes", async () => {
    client.send("SPFIND 1 zebra\n");
    const expected = reply(
      counts(1, 1, 1) +
        field(
          0x10,
          field(0x11, ascii("tst002")) +
            field(0x12, ascii(user)) +
            field(0x13, ascii("Zebra")) +
            field(0x14, le(1, 2)) +
            field(0x15, ascii("1.0")) +
            field(0x16, le(0, 4)),
        ),
    );
    assert.equal((await client.read(expected.length / 2)).toString("hex"), expected);
    assert.equal((await client.drain()).length, 0);
  });

  test("matches title and description, ignoring case, sorted by title", async () => {
    client.send("SPFIND 1 tEsT aPp\x0A\x0D");
    const page = await client.reply(decodeFind);
    assert.deepEqual(
      page.apps.map((app) => app.id),
      ["desc01", "tst001"],
    );
    assert.deepEqual([page.total, page.page, page.pages], [2, 1, 1]);
  });

  test("does not list deleted apps", async () => {
    client.send("SPFIND 1 gone\n");
    const page = await client.reply(decodeFind);
    assert.deepEqual([page.total, page.pages, page.apps.length], [0, 0, 0]);
  });

  test("does not list apps with no release, or only deleted releases", async () => {
    for (const command of ["SPFIND 1 shelf", "SPFIND 1 all gone"]) {
      client.send(`${command}\n`);
      const page = await client.reply(decodeFind);
      assert.deepEqual([page.total, page.pages, page.apps.length], [0, 0, 0]);
    }
  });

  test("the latest serial skips deleted releases", async () => {
    client.send("SPFIND 1 mixed case\n");
    const page = await client.reply(decodeFind);
    assert.deepEqual(page.apps[0].latest, { serial: 2, version: "1.1" });
  });

  test("an entry carries the download count", async () => {
    client.send("SPFIND 1 long history\n");
    assert.equal((await client.reply(decodeFind)).apps[0].downloads, 70000);
  });

  test("pages hold 20 entries", async () => {
    client.send("SPFIND 2 pager\n");
    const page2 = await client.reply(decodeFind);
    assert.deepEqual([page2.total, page2.page, page2.pages], [45, 2, 3]);
    assert.deepEqual(
      page2.apps.map((app) => app.title),
      Array.from({ length: 20 }, (_, i) => `Pager ${i + 21}`),
    );

    client.send("SPFIND 3 pager\n");
    assert.equal((await client.reply(decodeFind)).apps.length, 5);

    // Like DIR: a page past the end is empty, not an error.
    client.send("SPFIND 4 pager\n");
    const page4 = await client.reply(decodeFind);
    assert.deepEqual([page4.page, page4.pages, page4.apps.length], [4, 3, 0]);
  });

  test("bad page numbers and empty text give BadQuery_ERROR and keep the session", async () => {
    for (const command of ["SPFIND 0 spun", "SPFIND x spun", "SPFIND 65536 spun", "SPFIND 1", "SPFIND"]) {
      await expectError(`${command}\n`, "BadQuery_ERROR");
    }
    await expectOpen();
  });
});

describe("SPLIST", () => {
  before(connect);
  after(() => client.close());

  test("lists only public apps, newest update first, 20 to a page", async () => {
    const listed: string[] = [];
    let pages = 0;
    for (let page = 1; page === 1 || page <= pages; page++) {
      client.send(`SPLIST ${page}\n`);
      const reply = await client.reply(decodeFind);
      assert.equal(reply.page, page);
      assert.ok(reply.apps.length <= 20);
      pages = reply.pages;
      listed.push(...reply.apps.map((app) => app.id));
    }
    const publicIds = ["tst001", "tst002", "desc01", "abc123", "long01", ...pagerApps.map((app) => app.id)];
    assert.deepEqual([...listed].sort(), [...publicIds].sort());
    assert.equal(pages, Math.ceil(publicIds.length / 20));

    // The date of the newest live release decides, then the title; the date of
    // tst001's deleted serial 2 is the newest of all, and does not count.
    assert.deepEqual(listed.slice(0, 2), ["long01", "pg0001"]);
    assert.deepEqual(listed.slice(-4), ["tst001", "abc123", "desc01", "tst002"]);
  });

  test("an entry is the same as in SPFIND", async () => {
    client.send("SPLIST 1\n");
    const listed = (await client.reply(decodeFind)).apps.find((app) => app.id === "long01");
    client.send("SPFIND 1 long history\n");
    assert.deepEqual(listed, (await client.reply(decodeFind)).apps[0]);
  });

  test("with no page number sends page 1; a bad page number gives BadQuery_ERROR", async () => {
    client.send("SPLIST\n");
    assert.equal((await client.reply(decodeFind)).page, 1);
    for (const command of ["SPLIST 0", "SPLIST x", "SPLIST 65536"]) {
      await expectError(`${command}\n`, "BadQuery_ERROR");
    }
    await expectOpen();
  });
});

describe("SPINFO", () => {
  before(connect);
  after(() => client.close());

  test("an app id in capitals sends the agreed bytes, without deleted releases", async () => {
    client.send("SPINFO TST001\n");
    assert.equal((await client.read(TST001_INFO.length / 2)).toString("hex"), TST001_INFO);
    assert.equal((await client.drain()).length, 0);
  });

  test("carries the download count, the categories by name and the screenshots by slot", async () => {
    client.send("SPINFO abc123\n");
    const page = await client.reply(decodeInfo);
    assert.equal(page.app.downloads, 12);
    assert.deepEqual(page.app.categories, ["Games", "Tools"]);
    assert.deepEqual(page.app.screenshots, [
      { slot: 1, width: 320 },
      { slot: 4, width: 256 },
    ]);
    assert.equal(page.app.installDir, "/apps/mixed");
  });

  test("sends at most 16 categories", async () => {
    client.send("SPINFO long01\n");
    const page = await client.reply(decodeInfo);
    assert.equal(page.app.categories.length, 16);
    assert.equal(page.app.categories[0], "Category 01");
  });

  test("lists releases newest first, 64 to a page", async () => {
    client.send("SPINFO long01\n");
    const page1 = await client.reply(decodeInfo);
    assert.deepEqual([page1.total, page1.page, page1.pages], [150, 1, 3]);
    assert.equal(page1.releases.length, 64);
    assert.deepEqual(page1.releases[0], { serial: 150, version: "1.150", date: "2026-09-26" });

    client.send("SPINFO long01 3\n");
    const page3 = await client.reply(decodeInfo);
    assert.equal(page3.releases.length, 150 - 128);
    assert.equal(page3.releases[0].serial, 150 - 128);
  });

  test("an app with no release, or only deleted releases, gives NoApp_ERROR and keeps the session", async () => {
    for (const command of ["SPINFO empty1", "SPINFO allgn1"]) {
      await expectError(`${command}\n`, "NoApp_ERROR");
    }
    await expectOpen();
  });

  test("unknown, deleted and malformed app ids give NoApp_ERROR and keep the session", async () => {
    for (const command of ["SPINFO zzzzzz", "SPINFO gone01", "SPINFO abc", "SPINFO"]) {
      await expectError(`${command}\n`, "NoApp_ERROR");
    }
    await expectOpen();
  });

  test("a bad page number gives BadQuery_ERROR and keeps the session", async () => {
    await expectError("SPINFO tst001 0\n", "BadQuery_ERROR");
    await expectOpen();
  });
});

describe("SPCLOG", () => {
  before(connect);
  after(() => client.close());

  test("sends the changelog of one release", async () => {
    client.send("SPCLOG ABC123 2\n");
    assert.deepEqual(await client.reply(decodeChangelog), {
      serial: 2,
      version: "1.1",
      date: "2026-09-21",
      changelog: "Faster.\nFewer bugs.",
    });
  });

  test("a release with no changelog sends none", async () => {
    client.send("SPCLOG abc123 1\n");
    assert.equal((await client.reply(decodeChangelog)).changelog, null);
  });

  test("a deleted or unknown release gives NoRelease_ERROR and keeps the session", async () => {
    for (const command of ["SPCLOG abc123 3", "SPCLOG abc123 9"]) {
      await expectError(`${command}\n`, "NoRelease_ERROR");
    }
    await expectOpen();
  });

  test("an app that is not public gives NoApp_ERROR, a bad serial BadQuery_ERROR", async () => {
    for (const command of ["SPCLOG gone01 1", "SPCLOG allgn1 1", "SPCLOG abc 1", "SPCLOG"]) {
      await expectError(`${command}\n`, "NoApp_ERROR");
    }
    for (const command of ["SPCLOG abc123", "SPCLOG abc123 0", "SPCLOG abc123 x", "SPCLOG abc123 65536"]) {
      await expectError(`${command}\n`, "BadQuery_ERROR");
    }
    await expectOpen();
  });
});

describe("the old verbs", () => {
  before(connect);
  after(() => client.close());

  test("FIND and INFO are unknown commands, as in the NBN engine", async () => {
    await expectError("FIND 1 zebra\n", "BadCommand_ERROR");
    await client.drain();
    assert.equal(client.closed, true);
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

// A whole GET as .spun does it: one "!" for the header and for each block.
const expectFile = async (name: string, bytes: Buffer, served = name): Promise<void> => {
  client.send(`GET ${user}/${name}\n`);
  const header = Buffer.alloc(11);
  header[0] = 2;
  header.writeUInt32LE(bytes.length, 1);
  header.writeUInt32LE(Math.floor(bytes.length / BLOCK), 5);
  header.writeUInt16LE(bytes.length % BLOCK, 9);
  const expected = Buffer.concat([header, Buffer.from(`${served}\0`)]);
  assert.deepEqual(await client.read(expected.length), expected);

  for (let from = 0; from <= bytes.length; from += BLOCK) {
    const block = bytes.subarray(from, Math.min(from + BLOCK, bytes.length));
    client.send("!\r\n");
    assert.deepEqual(
      await client.read(block.length + 1),
      Buffer.concat([block, Buffer.from([checksum(block)])]),
    );
  }
  client.send("!\r\n");
};

// .spun update downloads several apps on one connection.
describe("two GETs on one connection", () => {
  before(connect);
  after(() => client.close());

  test("the second GET, of a file with an empty last block, also arrives whole", async () => {
    await expectFile("tst001-0001.zip", fileBytes);
    await expectFile("tst002-0001.zip", exactBytes);
    assert.equal((await client.drain()).length, 0);
    await expectOpen();
  });
});

const downloads = (id: string): number => tables.apps.find((app) => app.id === id)?.downloads ?? 0;

describe("download count", () => {
  beforeEach(connect);
  afterEach(() => client.close());

  test("a complete zip GET counts once, and a later \"!\" does not count again", async () => {
    const before = downloads("tst001");
    await expectFile("tst001-0001.zip", fileBytes);
    await client.drain();
    assert.equal(downloads("tst001"), before + 1);

    client.send("!\r\n");
    await client.drain();
    assert.equal(downloads("tst001"), before + 1);
    await expectOpen();
  });

  test("two zip GETs on one connection count one each", async () => {
    const [first, second] = [downloads("tst001"), downloads("tst002")];
    await expectFile("tst001-0001.zip", fileBytes);
    await expectFile("tst002-0001.zip", exactBytes);
    await client.drain();
    assert.deepEqual([downloads("tst001"), downloads("tst002")], [first + 1, second + 1]);
  });

  test("a zip GET in a directory chosen with CD counts", async () => {
    const before = downloads("tst001");
    client.send(`CD ${user}\n`);
    assert.equal((await client.read(3)).toString(), "!\r\n");
    await client.drain();
    client.send("GET tst001-0001.zip\n");
    await client.read(11 + "tst001-0001.zip".length + 1);
    for (let block = 0; block < 3; block++) {
      client.send("!\r\n");
      await client.read(block < 2 ? BLOCK + 1 : 101);
    }
    client.send("!\r\n");
    await client.drain();
    assert.equal(downloads("tst001"), before + 1);
  });

  test("a zip GET stopped before the last \"!\" does not count", async () => {
    const before = downloads("tst001");
    client.send(`GET ${user}/tst001-0001.zip\n`);
    await client.read(11 + "tst001-0001.zip".length + 1);
    client.send("!\r\n");
    await client.read(BLOCK + 1);
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(downloads("tst001"), before);

    // Every block arrived, but the client never acknowledged the last one.
    await connect();
    client.send(`GET ${user}/tst001-0001.zip\n`);
    await client.read(11 + "tst001-0001.zip".length + 1);
    for (let block = 0; block < 3; block++) {
      client.send("!\r\n");
      await client.read(block < 2 ? BLOCK + 1 : 101);
    }
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(downloads("tst001"), before);
  });

  test("a screenshot (NXI) GET does not count", async () => {
    const before = downloads("tst001");
    client.send(`GET ${user}/nxi/tst001/1\n`);
    await client.read(11 + 2);
    for (let block = 0; block < 3; block++) {
      client.send("!\r\n");
      await client.read(block < 2 ? BLOCK + 1 : 101);
    }
    client.send("!\r\n");
    await client.drain();
    assert.equal(downloads("tst001"), before);
    await expectOpen();
  });
});

describe("aliases", () => {
  beforeEach(connect);
  afterEach(() => client.close());

  const alias = (name: string) => tables.aliases?.find((row) => row.alias === name);

  test("SPINFO of an alias, in any case, sends the app's own bytes, with its real id", async () => {
    client.send("SPINFO tst001\n");
    const byId = await client.reply(decodeInfo);
    client.send("SPINFO TestApp\n");
    const byAlias = await client.reply(decodeInfo);
    assert.equal(byAlias.app.id, "tst001");
    assert.deepEqual(byAlias, byId);
  });

  test("an alias with _ and - names its app", async () => {
    client.send("SPINFO my_app-2\n");
    assert.equal((await client.reply(decodeInfo)).app.id, "tst002");
  });

  test("SPCLOG of an alias gives the app's changelog", async () => {
    client.send("SPCLOG promoted 1\n");
    assert.equal((await client.reply(decodeChangelog)).version, "test-upload-01");
  });

  test("an unknown alias, an alias of a deleted app and one of an app with no live release give NoApp_ERROR", async () => {
    for (const name of ["nosuchalias", "gonealias", "emptyalias", "bad.name", "seventeenchars123"]) {
      await expectError(`SPINFO ${name}\n`, "NoApp_ERROR");
      await expectError(`SPCLOG ${name} 1\n`, "NoApp_ERROR");
    }
    await expectOpen();
  });

  test("an alias moved to another app names the new app at the next request on the same connection", async () => {
    const row = alias("promoted");
    assert.ok(row);
    client.send("SPINFO promoted\n");
    assert.equal((await client.reply(decodeInfo)).app.id, "tst001");
    row.appId = "abc123";
    try {
      client.send("SPINFO promoted\n");
      assert.equal((await client.reply(decodeInfo)).app.id, "abc123");
    } finally {
      row.appId = "tst001";
    }
  });

  test("a zip GET by alias sends the app's zip and counts the real id", async () => {
    const before = downloads("tst001");
    await expectFile("testapp-0001.zip", fileBytes, "tst001-0001.zip");
    await client.drain();
    assert.equal(downloads("tst001"), before + 1);
    await expectOpen();
  });

  test("a screenshot GET by alias, also after CD, sends the app's screenshot", async () => {
    client.send(`GET ${user}/nxi/promoted/1\n`);
    await client.read(11 + 2);
    for (let block = 0; block < 3; block++) {
      client.send("!\r\n");
      await client.read(block < 2 ? BLOCK + 1 : 101);
    }
    client.send("!\r\n");
    await client.drain();

    client.send(`CD ${user}/nxi\n`);
    await client.drain();
    client.send("GET testapp/1\n");
    assert.equal((await client.read(11 + 2)).subarray(11).toString(), "1\0");
    await client.drain();
  });

  test("a GET by an unknown alias gives NoFile_ERROR", async () => {
    await expectError(`GET ${user}/nosuchalias-0001.zip\n`, "NoFile_ERROR");
    await expectOpen();
  });
});

describe("a database failure", () => {
  let failing: net.Server;
  let failingPort: number;

  before(async () => {
    // resolve() works, so that a GET reaches the download count
    const broken: Catalogue = {
      resolve: (name) => Promise.resolve(name as string as AppId),
      find: () => Promise.reject(new Error("database down")),
      list: () => Promise.reject(new Error("database down")),
      app: () => Promise.reject(new Error("database down")),
      releases: () => Promise.reject(new Error("database down")),
      changelog: () => Promise.reject(new Error("database down")),
      countDownload: () => Promise.reject(new Error("database down")),
    };
    ({ server: failing, port: failingPort } = await startSpunServer(broken, dataDir));
  });

  after(() => failing.close());

  test("gives ServerException_ERROR and ends the session, as the engine does", async () => {
    client = await SpoofClient.connect(failingPort);
    await expectError("SPFIND 1 spun\n", "ServerException_ERROR");
    await client.drain();
    assert.equal(client.closed, true);
    client.close();
  });

  test("in the download count also ends the session", async () => {
    client = await SpoofClient.connect(failingPort);
    client.send(`GET ${user}/tst001-0001.zip\n`);
    await client.read(11 + "tst001-0001.zip".length + 1);
    for (let block = 0; block < 3; block++) {
      client.send("!\r\n");
      await client.read(block < 2 ? BLOCK + 1 : 101);
    }
    await expectError("!\r\n", "ServerException_ERROR");
    await client.drain();
    assert.equal(client.closed, true);
    client.close();
  });
});

describe("lines sent together", () => {
  let slow: net.Server;
  let slowPort: number;

  // A slow database makes SPINFO finish after a DIR sent behind it, unless the
  // session handles DIR only after SPINFO has answered.
  before(async () => {
    const fast = fakeCatalogue(tables);
    const later = <T>(value: Promise<T>): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(value), 100));
    const delayed: Catalogue = {
      resolve: (...args) => later(fast.resolve(...args)),
      find: (...args) => later(fast.find(...args)),
      list: (...args) => later(fast.list(...args)),
      app: (...args) => later(fast.app(...args)),
      releases: (...args) => later(fast.releases(...args)),
      changelog: (...args) => later(fast.changelog(...args)),
      countDownload: (...args) => later(fast.countDownload(...args)),
    };
    ({ server: slow, port: slowPort } = await startSpunServer(delayed, dataDir));
  });

  after(() => slow.close());

  test("SPINFO then DIR in one write are answered in that order", async () => {
    client = await SpoofClient.connect(slowPort);
    try {
      client.send("DIR\n");
      await new Promise((resolve) => setTimeout(resolve, 200));
      const dir = await client.drain();
      assert.ok(dir.length > 0);

      client.send("SPINFO desc01\n");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const info = await client.drain();
      assert.ok(info.length > 0);

      client.send("SPINFO desc01\nDIR\n");
      assert.deepEqual(await client.read(info.length), info);
      assert.deepEqual(await client.read(dir.length), dir);
      assert.equal((await client.drain()).length, 0);
    } finally {
      client.close();
    }
  });
});
