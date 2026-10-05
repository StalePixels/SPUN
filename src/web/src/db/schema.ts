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
  tinyint,
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
  // Set means the user is disabled: no login, but their apps stay public.
  disabledAt: timestamp("disabled_at"),
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
  installDir: varchar("install_dir", { length: 64 }),
  downloads: int("downloads", { unsigned: true }).notNull().default(0),
  // Soft delete: the row stays, so the id is never reused.
  deletedAt: timestamp("deleted_at"),
});

// A second name for an app. Aliases and app ids share one namespace.
export const aliases = mysqlTable("aliases", {
  alias: varchar("alias", { length: 16 }).primaryKey(),
  appId: char("app_id", { length: 6 })
    .$type<AppId>()
    .notNull()
    .references(() => apps.id),
});

export const features = mysqlTable("features", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  appId: char("app_id", { length: 6 })
    .$type<AppId>()
    .notNull()
    .references(() => apps.id),
  article: varchar("article", { length: 1024 }).notNull(),
  articleHtml: text("article_html").notNull(),
  published: boolean("published").notNull().default(false),
  // Null only for a draft that never had a publish time.
  publishAt: timestamp("publish_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// A reserved dot command name that the app may ship. Only an admin adds or removes one.
export const dotOverrides = mysqlTable(
  "dot_overrides",
  {
    appId: char("app_id", { length: 6 })
      .$type<AppId>()
      .notNull()
      .references(() => apps.id),
    name: varchar("name", { length: 16 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.name] })],
);

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
    changelog: varchar("changelog", { length: 1024 }),
    // Soft delete: the serial is never reused; only the file goes.
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.serial] }),
    // Covers deleted releases too: a Next can have one installed.
    unique("releases_app_id_version_unique").on(t.appId, t.version),
  ],
);

export const categories = mysqlTable("categories", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  slug: varchar("slug", { length: 16 }).notNull().unique(),
  name: varchar("name", { length: 32 }).notNull(),
  // A deleted category keeps its app links; the web ignores it.
  deletedAt: timestamp("deleted_at"),
});

export const appCategories = mysqlTable(
  "app_categories",
  {
    appId: char("app_id", { length: 6 })
      .$type<AppId>()
      .notNull()
      .references(() => apps.id),
    categoryId: int("category_id", { unsigned: true })
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.appId, t.categoryId] })],
);

export const savedApps = mysqlTable(
  "saved_apps",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id),
    appId: char("app_id", { length: 6 })
      .$type<AppId>()
      .notNull()
      .references(() => apps.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.appId] })],
);

// The secret of a key is derived from its id and API_KEY_SECRET, so no secret is stored.
export const apiKeys = mysqlTable("api_keys", {
  id: char("id", { length: 16 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// One row for each filled slot; 1 is the main screenshot. An app delete keeps
// the rows, so a restore brings the screenshots back.
export const screenshots = mysqlTable(
  "screenshots",
  {
    appId: char("app_id", { length: 6 })
      .$type<AppId>()
      .notNull()
      .references(() => apps.id),
    slot: tinyint("slot", { unsigned: true }).notNull(),
    // 256 or 320: an NXI has no header, so the file alone cannot say.
    width: smallint("width", { unsigned: true }).notNull(),
    // Milliseconds: the PNG URL carries it, so two replaces in one second differ.
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.slot] })],
);
