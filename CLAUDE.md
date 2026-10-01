# CLAUDE.md

If `.CLAUDE.md` exists in the repo root, read it: private notes (hosts,
accounts, related repos) that must never be committed.

SPUN is a package manager for the ZX Spectrum Next. The CMS, where
publishers upload releases, is a Next.js 16 app in `src/web`. The server and
the `.spun` dot command will live in `src/server` and `src/client`.

## Commands (run in `src/web`)

- `make lint`, `make typecheck`, `make test` (Vitest), `make e2e` (Playwright)
- One unit test: `pnpm exec vitest run src/lib/rules.test.ts -t "<name>"`
- One e2e spec, on the e2e data as it is (no reset): `make e2e-up`, then
  `pnpm exec playwright test e2e/client/uploads.spec.ts`, then `make e2e-down`
- Dev server: `pnpm dev`; container: `docker compose up --build`

The e2e suite has its own database, storage directory, CMS and SPUNServer;
it never uses the development ones. `make e2e` resets the database and
storage (`make e2e-reset`, which runs `e2e/reset.mts`), starts the e2e CMS
and SPUNServer from the current tree in Docker (`make e2e-up`), runs
Playwright, and stops both servers again (`make e2e-down`), also after a
failure. They run only while tests need them. The e2e CMS is a production
build: a code change reaches it only through `make e2e-up`, which rebuilds
the image. Settings:
`src/web/.env.e2e` (keys in `.env.e2e.example`), the CMS's
`src/web/.env.e2e-cms` and the server's `src/server/.env.e2e`. After a
reset the database has no users: the admin account logs in first, so it
becomes the admin, and the setup publishes the client app that the MAME test
of `.spun` uses.

## Architecture

- Login is Auth.js against the NBN:ID OIDC server (`src/auth.ts`), with
  database sessions. Each login stores the user's full claim set in Redis.
- Data is Drizzle on MariaDB; `src/db/schema.ts` is the source of truth.
  Other components read these tables directly.
- `STORAGE_DIR` holds `public` (served by SPUNServer), `bin` (the recycle
  bin) and `assets` (web assets). Zips are in
  `public/<username>/<appid>-<serial as 4 hex>.zip` and screenshots in
  `public/<username>/nxi/<appid>/<slot>`. These are public download paths,
  so the layout is a contract.
- `src/lib` holds the rules as plain, unit-tested functions. Server actions
  in `src/app/**/actions.ts` call them.
- Validators and actions return `Problem` codes (`src/lib/problems.ts`); all
  user-facing English is in `src/lib/messages.ts`. Forms show errors with
  `FormError`, which sets `data-error` to the code.
- Admin: `src/lib/admin.ts` and `src/app/admin/`. `requireAdmin()` is the
  real check in every admin page, action and data function; lint allows
  imports of `admin.ts` only from `src/app/admin/`. `src/proxy.ts` is a
  cheap cookie gate.

## Gotchas

- App code comments follow the existing user style: none by default; only a
  why the code cannot show, in one or two lines above the function; almost
  nothing inside function bodies. Tests may comment freely.
- `throw` is for exceptions only, never routine behaviour such as quitting,
  ending a session or an expected error reply.
- The repo is public. Committed files carry placeholders; real hosts,
  accounts and paths are only in the gitignored `.env` files.
- Schema changes are made by hand on the database, then in `schema.ts`.
  There are no migrations until after the first proper deploy.
- A delete sets `deleted_at` and keeps the row, so ids and serials are never
  reused.
- Tests check behaviour and state (URL, rows, files, element state,
  `data-error` codes) and find elements by `data-testid`, so UI wording can
  change without breaking a test.
- Read `node_modules/next/dist/docs` before Next-specific code; Next 16
  differs from older versions.
- A package install breaks a running `next dev`: restart it.
- Login works only on the host name in `AUTH_URL`.
