import assert from "node:assert/strict";
import { once } from "node:events";
import * as net from "node:net";
import { test } from "node:test";
import { clientSteps, formatFixture, parseFixture, serverBytes, type Chunk } from "../src/fixture.js";
import { startProxy } from "../src/proxy.js";
import { SpoofClient } from "./harness.js";

test("the proxy forwards both ways and records each chunk in order", async () => {
  const upstream = net.createServer((socket) => {
    socket.on("data", (data) => socket.write(`echo ${data.toString()}`));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");

  let resolveSession: (chunks: Chunk[]) => void = () => {};
  const session = new Promise<Chunk[]>((resolve) => {
    resolveSession = resolve;
  });
  const proxy = startProxy(0, "127.0.0.1", (upstream.address() as net.AddressInfo).port, (chunks) =>
    resolveSession(chunks),
  );
  await once(proxy, "listening");

  const client = await SpoofClient.connect((proxy.address() as net.AddressInfo).port);
  client.send("one");
  assert.equal((await client.read(8)).toString(), "echo one");
  client.send("two");
  assert.equal((await client.read(8)).toString(), "echo two");
  client.close();

  const chunks = await session;
  assert.deepEqual(
    chunks.map((chunk) => [chunk.from, Buffer.from(chunk.hex, "hex").toString()]),
    [
      ["client", "one"],
      ["server", "echo one"],
      ["client", "two"],
      ["server", "echo two"],
    ],
  );

  // The fixture file round-trips, and replay waits for the server bytes
  // recorded before each client chunk.
  const parsed = parseFixture(formatFixture(chunks));
  assert.deepEqual(parsed, chunks);
  assert.deepEqual(
    clientSteps(parsed).map((step) => [step.serverBytesBefore, step.send.toString()]),
    [
      [0, "one"],
      [8, "two"],
    ],
  );
  assert.equal(serverBytes(parsed).toString(), "echo oneecho two");

  proxy.close();
  upstream.close();
});
