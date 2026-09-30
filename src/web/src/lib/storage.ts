import "server-only";
import { link, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { releaseFileName } from "./rules";
import { requireEnv } from "./env";

// One mount, STORAGE_DIR. public is the download tree; bin is outside it.
export function dataDir(): string {
  return path.join(requireEnv("STORAGE_DIR"), "public");
}

export function binDir(): string {
  return path.join(requireEnv("STORAGE_DIR"), "bin");
}

// Web assets; SPUNServer does not mount this.
export function assetDir(): string {
  return path.join(requireEnv("STORAGE_DIR"), "assets");
}

export function releasePath(username: string, appId: string, serial: number): string {
  return path.join(dataDir(), username, releaseFileName(appId, serial));
}

export function screenshotPath(username: string, appId: string, slot: number): string {
  return path.join(dataDir(), username, "nxi", appId, String(slot));
}

export function screenshotPngPath(appId: string, slot: number): string {
  return path.join(assetDir(), "screenshots", appId, `${slot}.png`);
}

function binPath(appId: string, serial: number): string {
  return path.join(binDir(), releaseFileName(appId, serial));
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

// link() fails if the target exists, so nothing is overwritten. A missing
// source is not an error: apps deleted before the bin have no zips.
async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await link(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
  await unlink(from);
}

export async function binRelease(username: string, appId: string, serial: number): Promise<void> {
  await moveFile(releasePath(username, appId, serial), binPath(appId, serial));
}

export async function unbinRelease(username: string, appId: string, serial: number): Promise<void> {
  await moveFile(binPath(appId, serial), releasePath(username, appId, serial));
}

export async function moveRelease(from: string, to: string, appId: string, serial: number): Promise<void> {
  await moveFile(releasePath(from, appId, serial), releasePath(to, appId, serial));
}

export async function userDirExists(username: string): Promise<boolean> {
  try {
    return (await stat(path.join(dataDir(), username))).isDirectory();
  } catch {
    return false;
  }
}

// A case-only change is the same directory on a case-insensitive disk.
export async function renameUserDir(from: string, to: string): Promise<void> {
  if (from.toLowerCase() !== to.toLowerCase() && (await userDirExists(to))) {
    throw new Error(`Directory for ${to} exists already.`);
  }
  await rename(path.join(dataDir(), from), path.join(dataDir(), to));
}

// A replace overwrites: the bin is only for deletes.
export async function writeScreenshot(
  username: string,
  appId: string,
  slot: number,
  files: { nxi: Buffer; png: Buffer },
): Promise<void> {
  for (const [file, data] of [
    [screenshotPath(username, appId, slot), files.nxi],
    [screenshotPngPath(appId, slot), files.png],
  ] as const) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
}

export async function removeScreenshot(username: string, appId: string, slot: number): Promise<void> {
  await removeFile(screenshotPath(username, appId, slot));
  await removeFile(screenshotPngPath(appId, slot));
}

function screenshotBinPaths(appId: string, slot: number) {
  return {
    nxi: path.join(binDir(), `${appId}-nxi-${slot}`),
    png: path.join(binDir(), `${appId}-png-${slot}`),
  };
}

export async function binScreenshot(username: string, appId: string, slot: number): Promise<void> {
  const bin = screenshotBinPaths(appId, slot);
  await moveFile(screenshotPath(username, appId, slot), bin.nxi);
  await moveFile(screenshotPngPath(appId, slot), bin.png);
}

export async function unbinScreenshot(username: string, appId: string, slot: number): Promise<void> {
  const bin = screenshotBinPaths(appId, slot);
  await moveFile(bin.nxi, screenshotPath(username, appId, slot));
  await moveFile(bin.png, screenshotPngPath(appId, slot));
}

// rename() refuses a target directory that has files in it.
export async function moveScreenshots(from: string, to: string, appId: string): Promise<void> {
  const target = path.join(dataDir(), to, "nxi", appId);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await rename(path.join(dataDir(), from, "nxi", appId), target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

export async function readScreenshotPng(appId: string, slot: number): Promise<Buffer | null> {
  try {
    return await readFile(screenshotPngPath(appId, slot));
  } catch {
    return null;
  }
}
