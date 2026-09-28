import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  int,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import type { AppId } from "../lib/apps";

// Property names must match what @auth/drizzle-adapter expects.
export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  emailVerified: timestamp("email_verified", { mode: "date", fsp: 3 }),
  image: varchar("image", { length: 255 }),
  username: varchar("username", { length: 16 }),
  usernameLower: varchar("username_lower", { length: 16 })
    .generatedAlwaysAs(sql`lower(\`username\`)`, { mode: "stored" })
    .unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Null means the default_app_limit setting applies.
  appLimit: int("app_limit", { unsigned: true }),
});

export const settings = mysqlTable("settings", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description").notNull(),
  value: text("value"),
});

export const accounts = mysqlTable(
  "accounts",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: int("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = mysqlTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// CMS tables. SPUNServer reads these directly.
export const apps = mysqlTable("apps", {
  id: char("id", { length: 6 }).$type<AppId>().primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 32 }).notNull(),
  description: varchar("description", { length: 256 }).notNull().default(""),
  // Soft delete: the row stays, so the id is never reused.
  deletedAt: timestamp("deleted_at"),
});

export const releases = mysqlTable(
  "releases",
  {
    appId: char("app_id", { length: 6 })
      .$type<AppId>()
      .notNull()
      .references(() => apps.id),
    serial: smallint("serial", { unsigned: true }).notNull(),
    version: varchar("version", { length: 16 }).notNull(),
    releaseDate: date("release_date", { mode: "string" }).notNull(),
    // Soft delete: the serial is never reused; only the file goes.
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.serial] }),
    // Covers deleted releases too: a Next can have one installed.
    unique("releases_app_id_version_unique").on(t.appId, t.version),
  ],
);
