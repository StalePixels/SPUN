import { Socket } from "node:net";

// A minimal SPUNServer client for the category commands: sends one command
// line and decodes the reply block (NBN reply, SPUN format 1). The tag
// numbers are in src/server/src/codec.ts. The e2e server listens on 48129.
const HOST = process.env.E2E_SPUN_HOST ?? "127.0.0.1";
const PORT = Number(process.env.E2E_SPUN_PORT ?? 48129);

const LONG_TAG = 0x80;
const Tag = { total: 0x01, page: 0x02, pages: 0x03, app: 0x10, appId: 0x11, category: 0x19, categoryEntry: 0x20, slug: 0x21 };

type Field = { tag: number; value: Buffer };

function fields(bytes: Buffer): Field[] {
  const out: Field[] = [];
  let at = 0;
  while (at < bytes.length) {
    const tag = bytes[at];
    const head = tag >= LONG_TAG ? 3 : 2;
    const length = tag >= LONG_TAG ? bytes[at + 1] | (bytes[at + 2] << 8) : bytes[at + 1];
    out.push({ tag, value: bytes.subarray(at + head, at + head + length) });
    at += head + length;
  }
  return out;
}

const number = (value: Buffer) => value.readUIntLE(0, Math.min(value.length, 4));

// The raw bytes the server sends until it closes the connection.
async function exchange(command: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = new Socket();
    socket.setTimeout(10_000, () => socket.destroy(new Error(`Timeout on ${command}`)));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const all = Buffer.concat(chunks);
      if (all[0] === 2 && all.length >= 4 && all.length >= 5 + (all[2] | (all[3] << 8))) socket.end();
      if (all[0] !== 2 && all.includes(10)) socket.end();
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks)));
    socket.connect(PORT, HOST, () => socket.write(`${command}\n`));
  });
}

export type Counts = { total: number; page: number; pages: number };
export type SpunReply =
  | ({ error: null; categories: { slug: string; name: string }[]; apps: string[] } & Counts)
  | { error: string };

export async function spun(command: string): Promise<SpunReply> {
  const raw = await exchange(command);
  if (raw[0] !== 2) return { error: raw.toString("latin1").trim() };
  const size = raw[2] | (raw[3] << 8);
  const top = fields(raw.subarray(4, 4 + size));
  const counts: Counts = { total: 0, page: 0, pages: 0 };
  const categories: { slug: string; name: string }[] = [];
  const apps: string[] = [];
  for (const { tag, value } of top) {
    if (tag === Tag.total) counts.total = number(value);
    if (tag === Tag.page) counts.page = number(value);
    if (tag === Tag.pages) counts.pages = number(value);
    if (tag === Tag.categoryEntry) {
      const entry = fields(value);
      const get = (t: number) => entry.find((f) => f.tag === t)?.value.toString("latin1") ?? "";
      categories.push({ slug: get(Tag.slug), name: get(Tag.category) });
    }
    if (tag === Tag.app) apps.push(fields(value).find((f) => f.tag === Tag.appId)?.value.toString("latin1") ?? "");
  }
  return { error: null, ...counts, categories, apps };
}
