import type { AppId, Catalogue, FoundApp, Release, Slice } from "../src/catalogue.js";

// In-memory copy of the CMS tables, with the same rules as the SQL in
// src/mysqlCatalogue.ts. Rows are shaped like the database rows.
export interface UserRow {
  id: string;
  username: string;
}

export interface AppRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  deleted?: boolean;
}

export interface ReleaseRow {
  appId: string;
  serial: number;
  version: string;
  releaseDate: string;
  deleted?: boolean;
}

export interface Tables {
  users: UserRow[];
  apps: AppRow[];
  releases: ReleaseRow[];
}

const slice = <T>(rows: T[], offset: number, limit: number): Slice<T> => ({
  total: rows.length,
  items: rows.slice(offset, offset + limit),
});

export function fakeCatalogue(tables: Tables): Catalogue {
  const username = (userId: string): string =>
    tables.users.find((user) => user.id === userId)?.username ?? "";

  const liveReleases = (appId: string): ReleaseRow[] =>
    tables.releases
      .filter((release) => release.appId === appId && !release.deleted)
      .sort((a, b) => b.serial - a.serial);

  const liveApp = (id: string): AppRow | undefined =>
    tables.apps.find((app) => app.id === id && !app.deleted);

  return {
    async find(text, offset, limit) {
      const needle = text.toLowerCase();
      const matches: FoundApp[] = tables.apps
        .filter(
          (app) =>
            !app.deleted &&
            liveReleases(app.id).length > 0 &&
            (app.title.toLowerCase().includes(needle) ||
              app.description.toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .map((app) => {
          const [latest] = liveReleases(app.id);
          return {
            id: app.id as AppId,
            username: username(app.userId),
            title: app.title,
            latest: { serial: latest.serial, version: latest.version },
          };
        });
      return slice(matches, offset, limit);
    },

    async app(id) {
      const app = liveApp(id);
      if (!app) {
        return null;
      }
      return { username: username(app.userId), title: app.title, description: app.description };
    },

    async releases(id, offset, limit) {
      const rows: Release[] = liveReleases(id).map((release) => ({
        serial: release.serial,
        version: release.version,
        date: release.releaseDate,
      }));
      return slice(rows, offset, limit);
    },
  };
}
