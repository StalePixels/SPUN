import { once } from "node:events";
import * as net from "node:net";
import { startServer } from "../../vendor/NBNtools/server/src/index.js";
import type { Catalogue } from "../src/catalogue.js";
import { spunServer } from "../src/SPUNServer.js";

// The engine logs every command and session to console.log. Keep the test
// output readable; set TEST_VERBOSE=1 to see it.
if (!process.env.TEST_VERBOSE) {
  console.log = () => {};
}

// Starts SPUNServer the way main.ts does, through the engine's startServer(),
// which reads its settings from NBN_* environment variables. extra sets more
// of them for this server only, such as { NBN_IDLE: "300" }.
export async function startSpunServer(
  catalogue: Catalogue,
  filePath: string,
  extra: Record<string, string> = {},
): Promise<{ server: net.Server; port: number }> {
  process.env.NBN_FILEPATH = filePath;
  process.env.NBN_IP = "127.0.0.1";
  process.env.NBN_PORT = "0";
  Object.assign(process.env, extra);
  try {
    const server = startServer(spunServer(catalogue));
    await once(server, "listening");
    return { server, port: (server.address() as net.AddressInfo).port };
  } finally {
    for (const name of Object.keys(extra)) {
      delete process.env[name];
    }
  }
}

// A client that reads exact byte counts, like the Next does from the UART.
export class SpoofClient {
  private buffered = Buffer.alloc(0);
  private wake: (() => void) | undefined;

  private constructor(private readonly socket: net.Socket) {
    socket.setNoDelay(true);
    socket.on("data", (data) => {
      this.buffered = Buffer.concat([this.buffered, data]);
      this.wake?.();
    });
    socket.on("close", () => this.wake?.());
  }

  static async connect(port: number): Promise<SpoofClient> {
    const socket = net.connect(port, "127.0.0.1");
    await once(socket, "connect");
    return new SpoofClient(socket);
  }

  send(data: string | Uint8Array): void {
    this.socket.write(data);
  }

  get closed(): boolean {
    return this.socket.destroyed || this.socket.readableEnded;
  }

  private async more(deadline: number): Promise<void> {
    const left = deadline - Date.now();
    if (left <= 0 || this.closed) {
      throw new Error(`Timed out with ${this.buffered.length} bytes: ${this.buffered.toString("hex")}`);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, left);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.wake = undefined;
  }

  async read(count: number, timeoutMs = 2000): Promise<Buffer> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffered.length < count) {
      await this.more(deadline);
    }
    const out = this.buffered.subarray(0, count);
    this.buffered = this.buffered.subarray(count);
    return out;
  }

  // Reads until the decoder accepts the bytes. The decoders throw a
  // RangeError while the reply is still short.
  async reply<T>(decode: (bytes: Uint8Array) => T, timeoutMs = 2000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const value = decode(this.buffered);
        this.buffered = Buffer.alloc(0);
        return value;
      } catch (err) {
        if (!(err instanceof RangeError)) {
          throw err;
        }
      }
      await this.more(deadline);
    }
  }

  // What arrives within the wait. Used to check that nothing more came.
  async drain(waitMs = 100): Promise<Buffer> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const out = this.buffered;
    this.buffered = Buffer.alloc(0);
    return out;
  }

  close(): void {
    this.socket.destroy();
  }
}
