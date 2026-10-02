import type { AppId, Catalogue, FoundApp, Release, Screenshot, Slice } from "../src/catalogue.js";

// In-memory copy of the CMS tables, with the same rules as the SQL in
// src/mysqlCatalogue.ts. Rows are shaped like the database rows; an app's
// live category names and its screenshot rows are kept on the app.
export interface UserRow {
  id: string;
  username: string;
}

export interface AppRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  downloads?: number;
  categories?: string[];
  screenshots?: Screenshot[];
  deleted?: boolean;
}

export interface ReleaseRow {
  appId: string;
  serial: number;
  version: string;
  releaseDate: string;
  changelog?: string;
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

  const publicApps = (): AppRow[] =>
    tables.apps.filter((app) => !app.deleted && liveReleases(app.id).length > 0);

  const byTitle = (a: AppRow, b: AppRow): number => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

  const found = (app: AppRow): FoundApp => {
    const [latest] = liveReleases(app.id);
    return {
      id: app.id as AppId,
      username: username(app.userId),
      title: app.title,
      latest: { serial: latest.serial, version: latest.version },
      downloads: app.downloads ?? 0,
    };
  };

  return {
    async find(text, offset, limit) {
      const needle = text.toLowerCase();
      const matches = publicApps()
        .filter(
          (app) => app.title.toLowerCase().includes(needle) || app.description.toLowerCase().includes(needle),
        )
        .sort(byTitle)
        .map(found);
      return slice(matches, offset, limit);
    },

    async list(offset, limit) {
      const date = (app: AppRow): string => liveReleases(app.id)[0].releaseDate;
      const listed = publicApps()
        .sort((a, b) => date(b).localeCompare(date(a)) || byTitle(a, b))
        .map(found);
      return slice(listed, offset, limit);
    },

    async app(id) {
      const app = liveApp(id);
      if (!app || liveReleases(id).length === 0) {
        return null;
      }
      return {
        username: username(app.userId),
        title: app.title,
        description: app.description,
        downloads: app.downloads ?? 0,
        categories: [...(app.categories ?? [])].sort(),
        screenshots: [...(app.screenshots ?? [])].sort((a, b) => a.slot - b.slot),
      };
    },

    async releases(id, offset, limit) {
      const rows: Release[] = liveReleases(id).map((release) => ({
        serial: release.serial,
        version: release.version,
        date: release.releaseDate,
      }));
      return slice(rows, offset, limit);
    },

    async changelog(id, serial) {
      const release = liveReleases(id).find((row) => row.serial === serial);
      return release
        ? {
            serial: release.serial,
            version: release.version,
            date: release.releaseDate,
            changelog: release.changelog ?? null,
          }
        : null;
    },

    async countDownload(id) {
      const app = tables.apps.find((row) => row.id === id);
      if (app) {
        app.downloads = (app.downloads ?? 0) + 1;
      }
    },
  };
}
