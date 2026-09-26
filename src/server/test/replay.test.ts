import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { clientSteps, parseFixture, serverBytes } from "../src/fixture.js";
import { fakeCatalogue } from "./fakeCatalogue.js";
import { SpoofClient, startSpunServer } from "./harness.js";

// A fixture is one session recorded by src/record.ts between a real Next
// (.nbnget) and the Phase 2 CDNServer. The files that session downloaded go
// in files/ beside it, at the same paths, so SPUNServer can serve them.
const packageRoot = path.resolve(import.meta.dirname, "../../..");
const fixture =
  process.env.REPLAY_FIXTURE ?? path.join(packageRoot, "test/fixtures/nbnget/session.jsonl");
const files = path.join(path.dirname(fixture), "files");

const missing = existsSync(fixture)
  ? false
  : `no replay fixture at ${fixture}. Record one with src/record.ts and a real Next.`;

test("SPUNServer answers a recorded .nbnget session with the recorded bytes", { skip: missing }, async () => {
  const chunks = parseFixture(readFileSync(fixture, "utf8"));
  const expected = serverBytes(chunks);
  const { server, port } = await startSpunServer(
    fakeCatalogue({ users: [], apps: [], releases: [] }),
    files,
  );
  const client = await SpoofClient.connect(port);
  try {
    let received = Buffer.alloc(0);
    for (const step of clientSteps(chunks)) {
      const want = step.serverBytesBefore - received.length;
      received = Buffer.concat([received, await client.read(want, 10000)]);
      assert.deepEqual(received, expected.subarray(0, received.length));
      client.send(step.send);
    }
    received = Buffer.concat([received, await client.read(expected.length - received.length, 10000)]);
    assert.deepEqual(received, expected);
    assert.equal((await client.drain(300)).length, 0);
  } finally {
    client.close();
    server.close();
  }
});
