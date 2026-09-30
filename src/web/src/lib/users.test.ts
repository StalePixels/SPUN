import { describe, expect, it } from "vitest";
import { renameUser, type UserRenameStore } from "./users";

function memoryStore(dirs: Set<string>, names: Map<string, string>, failUpdate = false) {
  const calls: string[] = [];
  const store: UserRenameStore = {
    async dirExists(username) {
      return dirs.has(username);
    },
    async renameDir(from, to) {
      calls.push(`dir ${from}->${to}`);
      dirs.delete(from);
      dirs.add(to);
    },
    async updateUsername(id, username) {
      calls.push(`row ${username}`);
      if (failUpdate) {
        throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      }
      names.set(id, username);
    },
  };
  return { store, calls };
}

describe("user rename", () => {
  it("renames the directory first, then the row", async () => {
    const dirs = new Set(["OldName1"]);
    const names = new Map([["u1", "OldName1"]]);
    const { store, calls } = memoryStore(dirs, names);
    await renameUser(store, "u1", "OldName1", "NewName1");
    expect(calls).toEqual(["dir OldName1->NewName1", "row NewName1"]);
    expect([...dirs]).toEqual(["NewName1"]);
    expect(names.get("u1")).toBe("NewName1");
  });

  it("puts the directory back when the update fails", async () => {
    const dirs = new Set(["OldName1"]);
    const names = new Map([["u1", "OldName1"]]);
    const { store, calls } = memoryStore(dirs, names, true);
    await expect(renameUser(store, "u1", "OldName1", "NewName1")).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    expect(calls).toEqual(["dir OldName1->NewName1", "row NewName1", "dir NewName1->OldName1"]);
    expect([...dirs]).toEqual(["OldName1"]);
    expect(names.get("u1")).toBe("OldName1");
  });

  it("needs no directory rename for a user with no directory", async () => {
    const { store, calls } = memoryStore(new Set(), new Map());
    await renameUser(store, "u1", "OldName1", "NewName1");
    expect(calls).toEqual(["row NewName1"]);
  });
});
