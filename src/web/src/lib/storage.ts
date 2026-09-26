import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { releaseFileName } from "./rules";
import { requireEnv } from "./env";

export function releasePath(username: string, appId: string, serial: number): string {
  return path.join(requireEnv("DATA_DIR"), username, releaseFileName(appId, serial));
}

export async function writeRelease(filePath: string, data: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  // "wx": a release file is never replaced.
  await writeFile(filePath, data, { flag: "wx" });
}

export async function readRelease(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
