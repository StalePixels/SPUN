import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

// The catalogue for the MAME tests of the .spun GUI (src/client/test/mame-gui.sh
// and mame-app.sh): more public apps than one SPLIST page holds, owned by the e2e
// client and admin, with release rows (no zip) and set download counts. gui024,
// the newest, has three releases with changelogs for the app page test; the
// others have one release each. gui024 is also in four of the categories that the
// reset seeds. "add" puts them in
// the e2e database, after removing any left from an earlier run; "remove" takes
// them out again. The ids are fixed, so a later run finds them.
// Run with: node e2e/gui-catalogue.mts add|remove

const web = path.join(import.meta.dirname, "..");
process.loadEnvFile(path.join(web, ".env.e2e"));

const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
const owners = [process.env.E2E_CLIENT_USERNAME ?? "", process.env.E2E_ADMIN_USERNAME ?? ""];
if (!new URL(databaseUrl).pathname.endsWith("_e2e") || owners.includes("")) {
  console.error("Refused: E2E_DATABASE_URL must name a database that ends in _e2e, and both e2e usernames must be set.");
  process.exit(1);
}

const COUNT = 24;
const GUI024_CATEGORIES = ["games", "demos", "music", "systool"];
// The apps whose description has this word; the scenario searches for it.
const SEARCH_WORD = "zebra";
const SEARCHED = [3, 11, 19];

type GuiRelease = { serial: number; version: string; date: string; changelog: string | null };
type GuiApp = { id: string; owner: string; title: string; description: string; releases: GuiRelease[]; downloads: number };

// The app page test (mame-app.sh) selects a release with the cursor keys and shows its changelog.
const CHANGELOGS = {
  3:
    "Thumbnails on the app page, and a full screen view of each screenshot.\n" +
    "\n" +
    "This line is longer than one row of the GUI, so the changelog page has to wrap it at a space between two words.\n" +
    "- Fixed the pointer at the bottom of the screen.",
  2: "A small fix.",
} as Record<number, string>;

function releases(n: number, two: string): GuiRelease[] {
  // 16 characters is the longest version.
  const version = n === 5 ? "2026.10.02-beta1" : `1.${n}`;
  const latest = { version, date: `2026-01-${two}` };
  if (n !== 24) {
    return [{ serial: 1, ...latest, changelog: null }];
  }
  return [
    { serial: 1, version: "1.22", date: "2026-01-10", changelog: null },
    { serial: 2, version: "1.23", date: "2026-01-17", changelog: CHANGELOGS[2] },
    { serial: 3, ...latest, changelog: CHANGELOGS[3] },
  ];
}

function apps(): GuiApp[] {
  return Array.from({ length: COUNT }, (_, index) => {
    const n = index + 1;
    const two = String(n).padStart(2, "0");
    return {
      id: `gui0${two}`,
      owner: owners[n % 2],
      // The longest title the CMS allows is 32 characters.
      title: n === 7 ? "Browse Test 07 with a long title" : `Browse Test ${two}`,
      description: SEARCHED.includes(n)
        ? `An app with a ${SEARCH_WORD} in it.`
        : n === 24
          ? "An app for the GUI test, with screenshots of both sizes and three releases. This description is long " +
            "enough to wrap over more than one row of the app page, so the test sees where the GUI breaks it."
          : "An app for the GUI test.",
      releases: releases(n, two),
      downloads: n === 9 ? 4294967295 : n * 37,
    };
  });
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const ids = apps().map((app) => app.id);
  for (const table of ["app_categories", "saved_apps", "screenshots", "releases"]) {
    await connection.query(`delete from ${table} where app_id in (?)`, [ids]);
  }
  await connection.query("delete from apps where id in (?)", [ids]);

  if (process.argv[2] === "add") {
    const [users] = await connection.query<RowDataPacket[]>("select id, username from users where username in (?)", [owners]);
    const userId = new Map(users.map((row) => [row.username as string, row.id as string]));
    for (const owner of owners) {
      if (!userId.has(owner)) {
        console.error(`No user ${owner} in the e2e database: run make e2e first.`);
        process.exit(1);
      }
    }
    for (const app of apps()) {
      await connection.query("insert into apps (id, user_id, title, description, downloads) values (?, ?, ?, ?, ?)", [
        app.id,
        userId.get(app.owner),
        app.title,
        app.description,
        app.downloads,
      ]);
      if (app.id === "gui024") {
        await connection.query(
          "insert into app_categories (app_id, category_id) select ?, id from categories where slug in (?)",
          [app.id, GUI024_CATEGORIES],
        );
      }
      for (const release of app.releases) {
        await connection.query(
          "insert into releases (app_id, serial, version, release_date, changelog) values (?, ?, ?, ?, ?)",
          [app.id, release.serial, release.version, release.date, release.changelog],
        );
      }
    }
    console.log(`Added ${ids[0]}-${ids[ids.length - 1]}.`);
  } else if (process.argv[2] === "remove") {
    console.log(`Removed ${ids[0]}-${ids[ids.length - 1]}.`);
  } else {
    console.error("usage: node e2e/gui-catalogue.mts add|remove");
    process.exit(1);
  }
} finally {
  await connection.end();
}
