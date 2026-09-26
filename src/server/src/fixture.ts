export interface Chunk {
  from: "client" | "server";
  ms: number;
  hex: string;
}

export interface Step {
  serverBytesBefore: number;
  send: Buffer;
}

export function formatFixture(chunks: readonly Chunk[]): string {
  return chunks.map((chunk) => JSON.stringify(chunk) + "\n").join("");
}

export function parseFixture(text: string): Chunk[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Chunk);
}

export function serverBytes(chunks: readonly Chunk[]): Buffer {
  return Buffer.concat(
    chunks.filter((chunk) => chunk.from === "server").map((chunk) => Buffer.from(chunk.hex, "hex")),
  );
}

// Each client chunk is sent only after the server bytes recorded before it
// have arrived, so the server sees the same command boundaries.
export function clientSteps(chunks: readonly Chunk[]): Step[] {
  const steps: Step[] = [];
  let received = 0;
  for (const chunk of chunks) {
    const bytes = Buffer.from(chunk.hex, "hex");
    if (chunk.from === "server") {
      received += bytes.length;
    } else {
      steps.push({ serverBytesBefore: received, send: bytes });
    }
  }
  return steps;
}
