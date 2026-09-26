import * as net from "node:net";
import type { Chunk } from "./fixture.js";

// Nagle is off on both sides, so each chunk goes on as it arrived: the NBN
// server reads each TCP read as one command.
export function startProxy(
  port: number,
  upstreamHost: string,
  upstreamPort: number,
  onSession: (chunks: Chunk[]) => void,
): net.Server {
  return net.createServer((client) => {
    const started = Date.now();
    const chunks: Chunk[] = [];
    const record = (from: Chunk["from"], data: Buffer): void => {
      chunks.push({ from, ms: Date.now() - started, hex: data.toString("hex") });
    };
    const upstream = net.connect(upstreamPort, upstreamHost);

    client.setNoDelay(true);
    upstream.setNoDelay(true);

    client.on("data", (data) => {
      record("client", data);
      upstream.write(data);
    });
    upstream.on("data", (data) => {
      record("server", data);
      client.write(data);
    });

    let open = 2;
    const closed = (): void => {
      open--;
      if (open === 0) {
        onSession(chunks);
      }
    };
    client.on("close", () => {
      upstream.end();
      closed();
    });
    upstream.on("close", () => {
      client.end();
      closed();
    });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  }).listen(port);
}
