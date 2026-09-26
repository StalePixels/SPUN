import { describe, expect, it } from "vitest";
import {
  allocateAppId,
  deleteApp,
  parseAppId,
  type AppDeleteStore,
  type AppId,
  type AppIdStore,
} from "./apps";

const K3X9QA = "k3x9qa" as AppId;

describe("app id", () => {
  it("accepts an id in any case and gives the lowercase id", () => {
    expect(parseAppId("K3X9qA")).toBe("k3x9qa");
  });

  it("rejects an id of the wrong length or with other characters", () => {
    expect(parseAppId("k3x9q")).toBeNull();
    expect(parseAppId("k3x9qa1")).toBeNull();
    expect(parseAppId("k3x-qa")).toBeNull();
  });
});

type Row = { id: string; deleted: boolean };

function memoryStore(rows: Row[], files: Set<string>): AppIdStore & AppDeleteStore {
  return {
    async idExists(id) {
      return rows.some((row) => row.id === id);
    },
    async markDeleted(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.deleted = true;
    },
    async releaseFilePaths(id) {
      return [`/Darran/${id}-0001.zip`, `/Darran/${id}-0002.zip`];
    },
    async removeFile(path) {
      files.delete(path);
    },
  };
}

describe("app delete", () => {
  it("keeps the row with a deleted mark and removes the release files", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: false }];
    const files = new Set(["/Darran/k3x9qa-0001.zip", "/Darran/k3x9qa-0002.zip"]);
    await deleteApp(memoryStore(rows, files), K3X9QA);
    expect(rows).toEqual([{ id: "k3x9qa", deleted: true }]);
    expect(files.size).toBe(0);
  });

  it("keeps the id reserved: a new app never gets it", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: false }];
    const store = memoryStore(rows, new Set());
    await deleteApp(store, K3X9QA);

    const candidates = ["k3x9qa", "k3x9qa", "p7m2zz"];
    const id = await allocateAppId(store, () => candidates.shift()! as AppId);
    expect(id).toBe("p7m2zz");
  });

  it("generates 6-character ids", async () => {
    const id = await allocateAppId(memoryStore([], new Set()));
    expect(id).toMatch(/^[0-9a-z]{6}$/);
  });
});
