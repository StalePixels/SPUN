import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@/db/schema";
import { requireEnv } from "./env";

let instance: MySql2Database<typeof schema> | undefined;

export function db(): MySql2Database<typeof schema> {
  if (!instance) {
    const pool = mysql.createPool({ uri: requireEnv("DATABASE_URL") });
    instance = drizzle(pool, { schema, mode: "default" });
  }
  return instance;
}
