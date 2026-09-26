import { existsSync } from "node:fs";
import path from "node:path";

// Every infrastructure value comes from .env.e2e (see .env.e2e.example).
const envFile = path.join(__dirname, "..", "..", ".env.e2e");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.e2e.example to .env.e2e and fill it in.`);
  }
  return value;
}

export type AccountKey = "client" | "admin";

export interface Account {
  key: AccountKey;
  email: string;
  password: string;
  username: string;
  imap: { host: string; port: number; user: string; password: string };
  // Saved browser login for this account.
  storageState: string;
}

function account(key: AccountKey): Account {
  const prefix = `E2E_${key.toUpperCase()}`;
  return {
    key,
    email: required(`${prefix}_EMAIL`),
    password: required(`${prefix}_PASSWORD`),
    username: required(`${prefix}_USERNAME`),
    imap: {
      host: required(`${prefix}_IMAP_HOST`),
      port: Number(required(`${prefix}_IMAP_PORT`)),
      user: required(`${prefix}_IMAP_USER`),
      password: required(`${prefix}_IMAP_PASSWORD`),
    },
    storageState: path.join(__dirname, "..", ".auth", `${key}.json`),
  };
}

export const settings = {
  baseUrl: required("E2E_BASE_URL"),
  nbnIdUrl: process.env.E2E_NBN_ID_URL || "https://id.nextbestnetwork.com/",
  databaseUrl: required("E2E_DATABASE_URL"),
  dataDir: required("E2E_DATA_DIR"),
};

export const accounts: Record<AccountKey, Account> = {
  client: account("client"),
  admin: account("admin"),
};
