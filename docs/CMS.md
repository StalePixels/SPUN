# Running the CMS and SPUNServer

This page is for the person who hosts SPUN. It covers the two servers, the database, the storage directory, mail to the admin, and what to back up.

## What runs

`docker/compose.yml` runs one Compose project, `spun`, with four services:

- `cms`: the web site and the API (Next.js, source in `src/web`). Publishers upload releases here and admins manage the site here.
- `spun-server`: SPUNServer (source in `src/server`). The `.spun` dot command on a Next talks to it. It speaks the NBN protocol of NBNtools, on port 48128. The `.spun` client has this port compiled in, so change it with `SPUN_PORT` only if you also build a client for it.
- `mariadb`: the database.
- `redis`: the claim set of each user, request counters and the nonces of signed API requests.

The CMS writes the storage directory. SPUNServer reads only `STORAGE_DIR/public`, mounted read-only, and reads the database. SPUNServer writes one thing: the download count (`apps.downloads`).

Users log in through an NBN:ID server (an OIDC server). The CMS has no passwords of its own.

## Settings files

The full list of settings, with a comment on each, is in two files. Read them; this page does not copy them.

- `docker/.env.example`: host paths, database name and passwords, ports. Copy it to `docker/.env`.
- `src/web/.env.example`: the CMS settings. Copy it to `docker/cms.env`, without the keys that `docker/.env.example` says `compose.yml` sets itself.
- `src/server/.env.example`: connection limits for SPUNServer. A `docker/server.env` is optional.

None of these files is committed. Treat `AUTH_SECRET`, `API_KEY_SECRET`, `AUTH_NBN_SECRET` and the database passwords as secrets.

`API_KEY_SECRET` signs every API key. If you change it, every existing API key stops working.

## Set up

1. Clone the repository with its submodule: `git clone --recurse-submodules`. The SPUNServer image compiles the NBN engine from `src/vendor/NBNtools`.
2. Make the host directories named in `docker/.env`. Make `STORAGE_DIR_HOST/public` first and give it to user id 1000. If it does not exist, Docker makes it as root and the CMS cannot write to it. Use local disks for the MariaDB and Redis directories, not NFS.
3. Register the CMS as a client on your NBN:ID server and put the issuer, client id and secret in `cms.env`.
4. Set `AUTH_URL` to the address people use for the CMS, for example `https://spun.example.com`. Login works only on that host name.
5. Start: `docker compose up --build -d` in `docker/`.
6. Put a reverse proxy with TLS in front of the CMS. The CMS listens on `127.0.0.1:48180` by default. Do not publish it on a public address. SPUNServer is published on its port directly.

### The database

MariaDB makes the empty database and its account on the first start. It does not make the tables. The tables are defined in `src/web/src/db/schema.ts`, and the repository has no migrations. The test setup `src/web/e2e/reset.mts` makes tables from that file with `drizzle-kit push`; the same command, run in `src/web` with `DATABASE_URL` pointing at your database, does the same for yours.

The CMS needs some rows to exist before it is useful:

- At least one live version of the terms and conditions, and at least one category, which an admin can add in `/admin` once logged in.
- A row in `settings` with the slug `default_app_limit`. The Settings page changes this row but does not create it. Without it, users have no app limit.

### Screenshot CRCs

Each row in `screenshots` has the CRC32 of the screenshot's thumbnail file (`thumb_crc`) and of its NXI file (`nxi_crc`). SPUNServer sends them to `.spun`, which uses them to keep the pictures it downloads in a cache on the SD card. The CMS sets both values when it writes a screenshot. The value 0 means "not known": SPUNServer does not send it, and `.spun` does not cache that file.

A database made before 0.8.1 has no such columns. Run `src/web/scripts/screenshot-crcs.mts` once on it, before you start a CMS or SPUNServer of 0.8.1 or later. The script adds the two columns if they are missing. Then it reads the files of each screenshot row and sets both values: from `STORAGE_DIR/public` for an app that is live, and from `STORAGE_DIR/bin` for an app that is deleted. A file that is not there gets 0, and the script prints its path. The script can run more than once; a second run changes only the rows whose files changed.

Run it in `src/web`, on a host that can reach the database and that has the storage directory:

```
DATABASE_URL=mysql://USER:PASSWORD@DB_HOST:3306/DATABASE STORAGE_DIR=/path/to/storage node scripts/screenshot-crcs.mts
```

Without these two variables in the environment, the script reads them from `src/web/.env`. `STORAGE_DIR` is the host path, the same directory as `STORAGE_DIR_HOST` in `docker/.env`. The CMS image does not contain the script. In `docker/compose.yml`, MariaDB has no port on the host: only containers on the project's network can reach it.

### The first admin

The first user who logs in becomes the admin. Log in once yourself before you announce the site. Every user after that is a normal user. An admin can make other users admins in `/admin/users`; see [ADMIN.md](ADMIN.md).

## Storage layout

`STORAGE_DIR` has three directories.

- `public`: what SPUNServer serves. Release zips are at `public/<username>/<appid>-<serial as 4 hex>.zip` and screenshots at `public/<username>/nxi/<appid>/<slot>`, with thumbnails in `public/<username>/thumb/<appid>/<slot>`. These are public download paths, so the layout is a contract with the `.spun` client.
- `bin`: the recycle bin, below.
- `assets`: web assets, such as the PNG copies of screenshots. SPUNServer does not mount it.

Do not put symbolic links in `STORAGE_DIR/public`. SPUNServer checks that a requested path is inside its directory in `isInsideRoot` (`src/vendor/NBNtools/server/src/lib/Server.ts`). That check uses `path.resolve`, not `realpath`, so a link inside the directory can point to a place outside it.

## The recycle bin

The CMS never removes a release zip. A delete moves the file from `public` to `bin`, so every delete can be audited and undone by an admin in `/admin`.

Names in the bin are flat:

- A release zip is `<appid>-<serial as 4 hex>.zip`.
- A screenshot is three files: `<appid>-nxi-<slot>`, `<appid>-png-<slot>` and `<appid>-thumb-<slot>`.

These names have no user name, so they are unique only because app ids are never reused. SPUNServer does not mount the bin, so a deleted file cannot be downloaded.

A screenshot replace or clear does not use the bin. The old files are overwritten or removed. Only the delete of a whole app moves its screenshots to the bin.

The CMS has no setting or page to empty the bin. Files leave it only when an admin restores them.

## Downloads

Only SPUNServer counts downloads. It adds one to `apps.downloads` when a Next confirms that a transfer finished. A download from the web site is not counted, on purpose.

## Screenshot conversion

The CMS uses `sharp` to convert screenshots. It must work on both arm64 and amd64, inside Docker and outside it. The CMS image is built on Alpine (musl), and `src/web/pnpm-lock.yaml` lists the prebuilt `sharp` packages for the glibc and musl builds of both architectures. After a change to `sharp` or to the base image, upload a PNG screenshot on each architecture you run.

## Mail to the admin

The CMS can send one plain-text mail to an admin address for each event you choose. A mail names the app, its publisher and the user who acted, with links. A screenshot mail has the image attached.

Mail is sent only when `SMTP_HOST` and `ADMIN_NOTIFY_EMAIL` are set and `NOTIFY_EVENTS` names at least one event. Since 0.8.1, only the events named in `NOTIFY_EVENTS` send mail. The names are listed in `src/web/.env.example` and in `src/web/src/lib/notices.ts`. A name that is not on that list sends nothing, and the CMS writes it to its log each time an event happens.

Mail is sent after the response, so a mail server that is slow or down never blocks a user. A failed mail is written to the CMS log and is not retried.

## Backups

Back up these together:

- The MariaDB data, or a dump of the database. Users, apps, releases, aliases, terms and download counts are only here.
- All of `STORAGE_DIR`: `public`, `bin` and `assets`. The zips in `public` and `bin` exist nowhere else.
- `docker/.env`, `docker/cms.env` and `docker/server.env`. Without `API_KEY_SECRET`, publishers must make new API keys.

Take the database and `STORAGE_DIR` at about the same time.

Redis keeps the claim set stored at each login, request counters and the nonces of recent API requests. The CMS replaces a user's claims at each login.
