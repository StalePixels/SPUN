import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("SPUN_VERSION", () => {
  it("is the content of src/client/VERSION, built into the CMS for the MCP server info", () => {
    const file = readFileSync(path.join(__dirname, "..", "..", "..", "client", "VERSION"), "utf8").trim();
    expect(file).toMatch(/^\d+\.\d+\.\d+/);
    expect(nextConfig.env?.SPUN_VERSION).toBe(file);
  });
});
