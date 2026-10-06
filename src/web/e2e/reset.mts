import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import Redis from "ioredis";
import mysql, { type RowDataPacket } from "mysql2/promise";

// Resets the e2e dataset named in .env.e2e: every table is dropped and made
// again from src/db/schema.ts, the seed rows go in, the storage directory is
// emptied, and the e2e CMS's Redis keys (REDIS_PREFIX in .env.e2e-cms) go.
// The saved logins go too, as their sessions are gone.
// Run with: node e2e/reset.mts

const web = path.join(import.meta.dirname, "..");
process.loadEnvFile(path.join(web, ".env.e2e"));

const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
const storageDir = process.env.E2E_STORAGE_DIR ?? "";
const database = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";

const cms = parseEnv(readFileSync(path.join(web, ".env.e2e-cms"), "utf8"));
const redisUrl = cms.REDIS_URL ?? "";
const redisPrefix = cms.REDIS_PREFIX ?? "";

// A guard against settings that name the development data by mistake.
if (
  !database.endsWith("_e2e") ||
  !path.basename(storageDir).endsWith("-e2e") ||
  !redisUrl ||
  !redisPrefix.includes("e2e")
) {
  console.error(
    "Refused: the E2E_DATABASE_URL database must end in _e2e, the E2E_STORAGE_DIR name in -e2e, " +
      "and .env.e2e-cms must set REDIS_URL and a REDIS_PREFIX that contains e2e.",
  );
  process.exit(1);
}

// The category list of the development database, in the same order.
const categories = [
  { slug: "apps", name: "Apps", installDir: "/apps", specificity: 1 },
  { slug: "games", name: "Games", installDir: "/games/next", specificity: 2 },
  { slug: "demos", name: "Demos", installDir: "/demos", specificity: 2 },
  { slug: "music", name: "Music", installDir: "/apps/audio", specificity: 7 },
  { slug: "basic", name: "BASIC", installDir: "/demos/NextBASIC", specificity: 2 },
  { slug: "systool", name: "System tools", installDir: "/apps/tools", specificity: 1 },
  { slug: "other", name: "Other", installDir: "/home", specificity: 10 },
];

const settings = [
  {
    slug: "default_app_limit",
    description:
      "The number of apps a user can publish, when the user has no limit of their own. Empty means no limit.",
    value: "2",
  },
];

const connection = await mysql.createConnection(databaseUrl);
try {
  const [tables] = await connection.query<RowDataPacket[]>(
    "select table_name as name from information_schema.tables where table_schema = ?",
    [database],
  );
  await connection.query("set foreign_key_checks = 0");
  for (const { name } of tables) {
    await connection.query(`drop table \`${name}\``);
  }
  await connection.query("set foreign_key_checks = 1");

  // drizzle.config.ts reads .env only for names that are not set already.
  execFileSync("pnpm", ["exec", "drizzle-kit", "push", "--force"], {
    cwd: web,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  for (const { slug, name, installDir, specificity } of categories) {
    await connection.query("insert into categories (slug, name, install_dir, specificity) values (?, ?, ?, ?)", [
      slug,
      name,
      installDir,
      specificity,
    ]);
  }
  for (const { slug, description, value } of settings) {
    await connection.query("insert into settings (slug, description, value) values (?, ?, ?)", [
      slug,
      description,
      value,
    ]);
  }
} finally {
  await connection.end();
}

// The directories stay, as running containers mount them; only their contents go.
for (const dir of ["public", "bin", "assets"]) {
  mkdirSync(path.join(storageDir, dir), { recursive: true });
}
for (const name of readdirSync(storageDir)) {
  const entry = path.join(storageDir, name);
  if (["public", "bin", "assets"].includes(name)) {
    for (const child of readdirSync(entry)) {
      rmSync(path.join(entry, child), { recursive: true, force: true });
    }
  } else {
    rmSync(entry, { recursive: true, force: true });
  }
}

const redis = new Redis(redisUrl);
try {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${redisPrefix}*`, "COUNT", 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
} finally {
  redis.disconnect();
}

rmSync(path.join(web, "e2e", ".auth"), { recursive: true, force: true });
console.log(`Reset ${database}, ${storageDir} and the Redis keys ${redisPrefix}*.`);
