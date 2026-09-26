import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { formatFixture } from "./fixture.js";
import { startProxy } from "./proxy.js";

const [port, upstream, outDir] = process.argv.slice(2);
const split = upstream?.lastIndexOf(":") ?? -1;
if (!port || !outDir || split < 1) {
  console.error("Usage: node build/server/src/record.js <port> <upstream host:port> <out dir>");
  process.exit(1);
}

startProxy(Number(port), upstream.slice(0, split), Number(upstream.slice(split + 1)), (chunks) => {
  const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  writeFileSync(file, formatFixture(chunks));
  console.log(`Saved ${chunks.length} chunks to ${file}`);
});
console.log(`Recording on port ${port}, forwarding to ${upstream}`);
