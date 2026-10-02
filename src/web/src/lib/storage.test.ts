import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { binRelease, binScreenshot, moveScreenshots, removeScreenshot, unbinRelease, unbinScreenshot, writeScreenshot } =
  await import("./storage");

let root: string;
const zip = () => path.join(root, "public", "Darran", "k3x9qa-0001.zip");
const binned = () => path.join(root, "bin", "k3x9qa-0001.zip");

function write(file: string, text: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "spun-storage-"));
  vi.stubEnv("STORAGE_DIR", root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("recycle bin", () => {
  it("moves a zip to the bin and back", async () => {
    write(zip(), "release 1");
    await binRelease("Darran", "k3x9qa", 1);
    expect(existsSync(zip())).toBe(false);
    expect(readFileSync(binned(), "utf8")).toBe("release 1");

    await unbinRelease("Darran", "k3x9qa", 1);
    expect(existsSync(binned())).toBe(false);
    expect(readFileSync(zip(), "utf8")).toBe("release 1");
  });

  it("never overwrites a file in the bin", async () => {
    write(zip(), "new");
    write(binned(), "old");
    await expect(binRelease("Darran", "k3x9qa", 1)).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(binned(), "utf8")).toBe("old");
    expect(readFileSync(zip(), "utf8")).toBe("new");
  });

  it("never overwrites a zip in the data directory", async () => {
    write(zip(), "live");
    write(binned(), "binned");
    await expect(unbinRelease("Darran", "k3x9qa", 1)).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(zip(), "utf8")).toBe("live");
    expect(readFileSync(binned(), "utf8")).toBe("binned");
  });
});

describe("screenshots", () => {
  const nxi = (user: string) => path.join(root, "public", user, "nxi", "k3x9qa", "2");
  const thumb = (user: string) => path.join(root, "public", user, "thumb", "k3x9qa", "2");
  const png = () => path.join(root, "assets", "screenshots", "k3x9qa", "2.png");
  const shot = (text: string) => ({
    nxi: Buffer.from(`nxi ${text}`),
    png: Buffer.from(`png ${text}`),
    thumb: Buffer.from(`thumb ${text}`),
  });

  it("writes the NXI and thumbnail under the user and the PNG in the assets, and a replace overwrites all three", async () => {
    await writeScreenshot("Darran", "k3x9qa", 2, shot("old"));
    await writeScreenshot("Darran", "k3x9qa", 2, shot("new"));
    expect(readFileSync(nxi("Darran"), "utf8")).toBe("nxi new");
    expect(readFileSync(thumb("Darran"), "utf8")).toBe("thumb new");
    expect(readFileSync(png(), "utf8")).toBe("png new");
  });

  it("removes all three files", async () => {
    await writeScreenshot("Darran", "k3x9qa", 2, shot("a"));
    await removeScreenshot("Darran", "k3x9qa", 2);
    expect(existsSync(nxi("Darran"))).toBe(false);
    expect(existsSync(thumb("Darran"))).toBe(false);
    expect(existsSync(png())).toBe(false);
  });

  it("moves all three files to the bin and back", async () => {
    await writeScreenshot("Darran", "k3x9qa", 2, shot("a"));
    await binScreenshot("Darran", "k3x9qa", 2);
    expect(existsSync(nxi("Darran"))).toBe(false);
    expect(existsSync(thumb("Darran"))).toBe(false);
    expect(existsSync(png())).toBe(false);
    expect(readFileSync(path.join(root, "bin", "k3x9qa-nxi-2"), "utf8")).toBe("nxi a");
    expect(readFileSync(path.join(root, "bin", "k3x9qa-png-2"), "utf8")).toBe("png a");
    expect(readFileSync(path.join(root, "bin", "k3x9qa-thumb-2"), "utf8")).toBe("thumb a");

    await unbinScreenshot("Darran", "k3x9qa", 2);
    expect(readFileSync(nxi("Darran"), "utf8")).toBe("nxi a");
    expect(readFileSync(thumb("Darran"), "utf8")).toBe("thumb a");
    expect(readFileSync(png(), "utf8")).toBe("png a");
  });

  it("bins and restores a screenshot that has no thumbnail", async () => {
    write(nxi("Darran"), "nxi old");
    write(png(), "png old");
    await binScreenshot("Darran", "k3x9qa", 2);
    await unbinScreenshot("Darran", "k3x9qa", 2);
    expect(readFileSync(nxi("Darran"), "utf8")).toBe("nxi old");
    expect(existsSync(thumb("Darran"))).toBe(false);
  });

  it("moves the app's nxi and thumb folders to another user, and does nothing when there are none", async () => {
    await writeScreenshot("Darran", "k3x9qa", 2, shot("a"));
    await moveScreenshots("Darran", "Fanny", "k3x9qa");
    expect(existsSync(nxi("Darran"))).toBe(false);
    expect(existsSync(thumb("Darran"))).toBe(false);
    expect(readFileSync(nxi("Fanny"), "utf8")).toBe("nxi a");
    expect(readFileSync(thumb("Fanny"), "utf8")).toBe("thumb a");
    await moveScreenshots("Darran", "Fanny", "k3x9qa");
    expect(readFileSync(nxi("Fanny"), "utf8")).toBe("nxi a");
    expect(readFileSync(thumb("Fanny"), "utf8")).toBe("thumb a");
  });
});
