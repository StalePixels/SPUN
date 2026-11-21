import { describe, expect, it } from "vitest";
import { clientIpFrom, trustedProxies } from "./clientip";

// No TRUSTED_PROXIES: the default private and local ranges.
const DEFAULTS = {};

describe("clientIpFrom", () => {
  it("returns a single public address", () => {
    expect(clientIpFrom("203.0.113.7", DEFAULTS)).toBe("203.0.113.7");
  });

  it("skips private proxies to the right of the client", () => {
    expect(clientIpFrom("203.0.113.7, 172.18.0.3, 10.0.0.2", DEFAULTS)).toBe("203.0.113.7");
  });

  it("ignores a spoofed entry left of the real address", () => {
    expect(clientIpFrom("1.2.3.4, 203.0.113.7, 192.168.1.10", DEFAULTS)).toBe("203.0.113.7");
  });

  it("ignores a spoofed private entry left of the real address", () => {
    expect(clientIpFrom("10.9.9.9, 198.51.100.20, 127.0.0.1", DEFAULTS)).toBe("198.51.100.20");
  });

  it("returns the last address when every address is trusted", () => {
    expect(clientIpFrom("192.168.1.5, 10.0.0.2", DEFAULTS)).toBe("10.0.0.2");
    expect(clientIpFrom("192.168.1.5", DEFAULTS)).toBe("192.168.1.5");
  });

  it("handles a public IPv6 client behind an fc00::/7 proxy", () => {
    expect(clientIpFrom("2001:db8::1, fd12:3456::2", DEFAULTS)).toBe("2001:db8::1");
    expect(clientIpFrom("2001:db8::1, ::1", DEFAULTS)).toBe("2001:db8::1");
  });

  it("treats IPv4-mapped IPv6 as the IPv4 address", () => {
    expect(clientIpFrom("203.0.113.7, ::ffff:192.168.1.5", DEFAULTS)).toBe("203.0.113.7");
    expect(clientIpFrom("::ffff:203.0.113.7, ::FFFF:10.0.0.1", DEFAULTS)).toBe("203.0.113.7");
  });

  it("uses TRUSTED_PROXIES in place of the defaults", () => {
    const env = { TRUSTED_PROXIES: "198.51.100.0/24, 2001:db8:1::/48" };
    // A public range is trusted now.
    expect(clientIpFrom("203.0.113.7, 198.51.100.9", env)).toBe("203.0.113.7");
    expect(clientIpFrom("203.0.113.7, 2001:db8:1::5", env)).toBe("203.0.113.7");
    // A private range is not trusted any more.
    expect(clientIpFrom("203.0.113.7, 10.0.0.2", env)).toBe("10.0.0.2");
  });

  it("takes a bare address in TRUSTED_PROXIES as a single host", () => {
    const env = { TRUSTED_PROXIES: "198.51.100.9" };
    expect(clientIpFrom("203.0.113.7, 198.51.100.9", env)).toBe("203.0.113.7");
    expect(clientIpFrom("203.0.113.7, 198.51.100.10", env)).toBe("198.51.100.10");
  });

  it("uses the defaults when TRUSTED_PROXIES is empty", () => {
    expect(clientIpFrom("203.0.113.7, 10.0.0.2", { TRUSTED_PROXIES: "" })).toBe("203.0.113.7");
    expect(clientIpFrom("203.0.113.7, 10.0.0.2", { TRUSTED_PROXIES: " , " })).toBe("203.0.113.7");
  });

  it("returns unknown for a missing or empty header", () => {
    expect(clientIpFrom(null, DEFAULTS)).toBe("unknown");
    expect(clientIpFrom("", DEFAULTS)).toBe("unknown");
    expect(clientIpFrom(" , ,", DEFAULTS)).toBe("unknown");
  });

  it("trims spaces and ignores empty entries", () => {
    expect(clientIpFrom("  203.0.113.7 ,, 10.0.0.2 ,", DEFAULTS)).toBe("203.0.113.7");
  });

  it("does not trust an entry that is not an address", () => {
    expect(clientIpFrom("203.0.113.7, garbage, 10.0.0.2", DEFAULTS)).toBe("garbage");
  });
});

describe("trustedProxies", () => {
  it("refuses an invalid network", () => {
    for (const bad of ["10.0.0.0/33", "fc00::/129", "not-an-ip", "10.0.0.0/8/1", "10.0.0.0/x", "10.0.0.0/"]) {
      expect(() => trustedProxies({ TRUSTED_PROXIES: bad })).toThrow(/TRUSTED_PROXIES/);
    }
  });
});
