import { existsSync } from "node:fs";
import * as path from "node:path";

// Test usernames come from the environment or src/server/.env (see .env.example),
// so a local run can use real test accounts without naming them in the repo.
const envFile = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// The CMS username rule: isValidSlug in src/web/src/lib/rules.ts.
const USERNAME_RE = /^[A-Za-z0-9_-]{1,16}$/;

function username(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (!USERNAME_RE.test(value)) {
    throw new Error(`${name}="${value}" is not a valid username: use 1-16 of A-Z a-z 0-9 _ -.`);
  }
  return value;
}

export const settings = {
  publisher: username("SPUN_TEST_PUBLISHER", "TestPublisher"),
  otherPublisher: username("SPUN_TEST_OTHER_PUBLISHER", "OtherPublisher"),
};
