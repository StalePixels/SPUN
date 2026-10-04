import { describe, expect, it, vi } from "vitest";
import type { AppBinStore, AppId, AppIdStore, AppMoveStore } from "./apps";

vi.mock("server-only", () => ({}));

const { allocateAppId, checkAliasFree, deleteApp, moveApp, parseAppId, restoreApp } = await import("./apps");

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

// Release serial -> deleted on its own. Files are "data/<serial>" or "bin/<serial>";
// the screenshots are "data/nxi" or "bin/nxi".
function memoryStore(
  rows: Row[],
  releases: Map<number, boolean>,
  files: Set<string>,
  aliases: string[] = [],
): AppIdStore & AppBinStore {
  return {
    async idExists(name) {
      return rows.some((row) => row.id === name.toLowerCase());
    },
    async aliasExists(name) {
      return aliases.includes(name.toLowerCase());
    },
    async markDeleted(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.deleted = true;
    },
    async clearDeleted(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.deleted = false;
    },
    async liveSerials() {
      return [...releases].filter(([, deleted]) => !deleted).map(([serial]) => serial);
    },
    async binRelease(_id, serial) {
      files.delete(`data/${serial}`);
      files.add(`bin/${serial}`);
    },
    async unbinRelease(_id, serial) {
      files.delete(`bin/${serial}`);
      files.add(`data/${serial}`);
    },
    async binScreenshots() {
      if (files.delete("data/nxi")) files.add("bin/nxi");
    },
    async unbinScreenshots() {
      if (files.delete("bin/nxi")) files.add("data/nxi");
    },
  };
}

describe("app delete", () => {
  it("keeps the row with a deleted mark and moves the release files and screenshots to the bin", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: false }];
    const files = new Set(["data/1", "data/2", "data/nxi"]);
    await deleteApp(memoryStore(rows, new Map([[1, false], [2, false]]), files), K3X9QA);
    expect(rows).toEqual([{ id: "k3x9qa", deleted: true }]);
    expect([...files].sort()).toEqual(["bin/1", "bin/2", "bin/nxi"]);
  });

  it("keeps the id reserved: a new app never gets it", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: false }];
    const store = memoryStore(rows, new Map(), new Set());
    await deleteApp(store, K3X9QA);

    const candidates = ["k3x9qa", "k3x9qa", "p7m2zz"];
    const id = await allocateAppId(store, () => candidates.shift()! as AppId);
    expect(id).toBe("p7m2zz");
  });

  it("skips an id that is already an alias", async () => {
    const store = memoryStore([], new Map(), new Set(), ["promo1"]);
    const candidates = ["promo1", "p7m2zz"];
    const id = await allocateAppId(store, () => candidates.shift()! as AppId);
    expect(id).toBe("p7m2zz");
  });

  it("generates 6-character ids", async () => {
    const id = await allocateAppId(memoryStore([], new Map(), new Set()));
    expect(id).toMatch(/^[0-9a-z]{6}$/);
  });
});

describe("alias namespace", () => {
  const rows: Row[] = [
    { id: "k3x9qa", deleted: false },
    { id: "d3l3t3", deleted: true },
  ];
  const store = memoryStore(rows, new Map(), new Set(), ["promoted"]);

  it("refuses an alias that is an app id, live or deleted, in any case", async () => {
    expect(await checkAliasFree(store, "k3x9qa")).toEqual({ code: "alias.isAppId" });
    expect(await checkAliasFree(store, "K3X9QA")).toEqual({ code: "alias.isAppId" });
    expect(await checkAliasFree(store, "d3l3t3")).toEqual({ code: "alias.isAppId" });
  });

  it("refuses an alias that another alias has, in any case", async () => {
    expect(await checkAliasFree(store, "promoted")).toEqual({ code: "alias.taken" });
    expect(await checkAliasFree(store, "Promoted")).toEqual({ code: "alias.taken" });
  });

  it("accepts a free name", async () => {
    expect(await checkAliasFree(store, "spun-wifi")).toBeNull();
  });
});

describe("app restore", () => {
  it("moves back only the releases that are not deleted on their own", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: false }];
    // Release 2 was deleted before the app, so its file is already in the bin.
    const files = new Set(["data/1", "bin/2", "data/3", "data/nxi"]);
    const store = memoryStore(rows, new Map([[1, false], [2, true], [3, false]]), files);

    await deleteApp(store, K3X9QA);
    expect([...files].sort()).toEqual(["bin/1", "bin/2", "bin/3", "bin/nxi"]);

    await restoreApp(store, K3X9QA);
    expect(rows).toEqual([{ id: "k3x9qa", deleted: false }]);
    expect([...files].sort()).toEqual(["bin/2", "data/1", "data/3", "data/nxi"]);
  });

  it("clears the deleted mark only after the files are back", async () => {
    const rows: Row[] = [{ id: "k3x9qa", deleted: true }];
    const store = memoryStore(rows, new Map([[1, false]]), new Set(["bin/1"]));
    store.unbinRelease = async () => {
      throw new Error("disk full");
    };
    await expect(restoreApp(store, K3X9QA)).rejects.toThrow("disk full");
    expect(rows).toEqual([{ id: "k3x9qa", deleted: true }]);
  });
});

describe("app move", () => {
  // Files are "<username>/<serial>" and "<username>/nxi".
  function moveStore(files: Set<string>, owner: { id: string }, fail: { update?: boolean; serial?: number } = {}) {
    const calls: string[] = [];
    const store: AppMoveStore = {
      async moveRelease(serial, from, to) {
        calls.push(`zip ${serial} ${from}->${to}`);
        if (serial === fail.serial) {
          throw new Error("disk full");
        }
        files.delete(`${from}/${serial}`);
        files.add(`${to}/${serial}`);
      },
      async moveScreenshots(from, to) {
        calls.push(`nxi ${from}->${to}`);
        if (files.delete(`${from}/nxi`)) files.add(`${to}/nxi`);
      },
      async updateOwner(_id, userId) {
        calls.push(`row ${userId}`);
        if (fail.update) {
          throw Object.assign(new Error("lost connection"), { code: "PROTOCOL_CONNECTION_LOST" });
        }
        owner.id = userId;
      },
    };
    return { store, calls };
  }
  const move = { from: "Darran", to: "Fanny", userId: "u2" };

  it("moves the zips and screenshots first, then changes the owner row", async () => {
    const files = new Set(["Darran/1", "Darran/3", "Darran/nxi"]);
    const owner = { id: "u1" };
    const { store, calls } = moveStore(files, owner);
    await moveApp(store, K3X9QA, [1, 3], move);
    expect(calls).toEqual(["zip 1 Darran->Fanny", "zip 3 Darran->Fanny", "nxi Darran->Fanny", "row u2"]);
    expect([...files].sort()).toEqual(["Fanny/1", "Fanny/3", "Fanny/nxi"]);
    expect(owner.id).toBe("u2");
  });

  it("moves the zips and screenshots back when the row update fails", async () => {
    const files = new Set(["Darran/1", "Darran/3", "Darran/nxi"]);
    const owner = { id: "u1" };
    const { store } = moveStore(files, owner, { update: true });
    await expect(moveApp(store, K3X9QA, [1, 3], move)).rejects.toMatchObject({ code: "PROTOCOL_CONNECTION_LOST" });
    expect([...files].sort()).toEqual(["Darran/1", "Darran/3", "Darran/nxi"]);
    expect(owner.id).toBe("u1");
  });

  it("moves back the zips already moved when a later zip fails", async () => {
    const files = new Set(["Darran/1", "Darran/3"]);
    const owner = { id: "u1" };
    const { store, calls } = moveStore(files, owner, { serial: 3 });
    await expect(moveApp(store, K3X9QA, [1, 3], move)).rejects.toThrow("disk full");
    expect(calls).toEqual(["zip 1 Darran->Fanny", "zip 3 Darran->Fanny", "zip 1 Fanny->Darran"]);
    expect([...files].sort()).toEqual(["Darran/1", "Darran/3"]);
    expect(owner.id).toBe("u1");
  });
});
