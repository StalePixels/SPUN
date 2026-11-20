import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./categories", () => ({ liveCategories: async () => [{ id: 1 }], appCategoryList: async () => [], setAppCategories: async () => {} }));

const { checkAppFields } = await import("./apps");

const fields = { title: "My App", description: "", installDir: "/apps/myapp", minCore: "", categories: [1] };

describe("checkAppFields and the minimum core version", () => {
  it("reads an empty minimum core as none", async () => {
    expect(await checkAppFields(fields)).toEqual({ ok: true, installDir: "/apps/myapp", minCore: null, categoryIds: [1] });
    expect(await checkAppFields({ ...fields, minCore: "  " })).toMatchObject({ ok: true, minCore: null });
  });

  it("packs a minimum core as a number", async () => {
    expect(await checkAppFields({ ...fields, minCore: "3.1.10" })).toMatchObject({ ok: true, minCore: 0x03010a });
  });

  it("refuses a bad minimum core with its code", async () => {
    expect(await checkAppFields({ ...fields, minCore: "3.01" })).toEqual({ ok: false, error: { code: "minCore.format" } });
    expect(await checkAppFields({ ...fields, minCore: "3.01.256" })).toEqual({ ok: false, error: { code: "minCore.range" } });
  });

  it("checks the other fields first", async () => {
    expect(await checkAppFields({ ...fields, title: "", minCore: "bad" })).toMatchObject({
      ok: false,
      error: { code: "title.length" },
    });
  });
});
