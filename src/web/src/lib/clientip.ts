import { BlockList, isIP } from "node:net";

export const DEFAULT_TRUSTED_PROXIES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
];

type Family = "ipv4" | "ipv6";

function family(address: string): Family | null {
  const kind = isIP(address);
  return kind === 4 ? "ipv4" : kind === 6 ? "ipv6" : null;
}

function plainAddress(address: string): string {
  const mapped = /^::ffff:(.+)$/i.exec(address);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : address;
}

function addNetwork(list: BlockList, text: string): void {
  const [base, prefixText, extra] = text.split("/");
  const address = plainAddress(base);
  const kind = family(address);
  const bits = kind === "ipv4" ? 32 : 128;
  const prefix = prefixText === undefined ? bits : /^[0-9]+$/.test(prefixText) ? Number(prefixText) : NaN;
  if (kind === null || extra !== undefined || !(prefix <= bits)) {
    throw new Error(`TRUSTED_PROXIES has an invalid network "${text}". See .env.example.`);
  }
  list.addSubnet(address, prefix, kind);
}

export function trustedProxies(env: Record<string, string | undefined> = process.env): BlockList {
  const named = (env.TRUSTED_PROXIES ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const networks = named.length > 0 ? named : DEFAULT_TRUSTED_PROXIES;
  const list = new BlockList();
  for (const network of networks) {
    addNetwork(list, network);
  }
  return list;
}

function isTrusted(list: BlockList, address: string): boolean {
  const kind = family(address);
  return kind !== null && list.check(address, kind);
}

// Proxies append to X-Forwarded-For, so only the entries to the right of the nearest untrusted one can be believed.
export function clientIpFrom(header: string | null, env: Record<string, string | undefined> = process.env): string {
  const addresses = (header ?? "")
    .split(",")
    .map((part) => plainAddress(part.trim()))
    .filter(Boolean);
  if (addresses.length === 0) {
    return "unknown";
  }
  const list = trustedProxies(env);
  return addresses.findLast((address) => !isTrusted(list, address)) ?? addresses[addresses.length - 1];
}
