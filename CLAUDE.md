# CLAUDE.md

If `.CLAUDE.md` exists in the repo root, read it: private notes (hosts,
accounts, related repos) that must never be committed.

SPUN is a package manager for the ZX Spectrum Next. The CMS, where
publishers upload releases, is a Next.js 16 app in `src/web`. The server and
the `.spun` dot command will live in `src/server` and `src/client`.

## Commands (run in `src/web`)

- `make lint`, `make typecheck`, `make test` (Vitest), `make e2e` (Playwright)
- One unit test: `pnpm exec vitest run src/lib/rules.test.ts -t "<name>"`
- One e2e spec: `pnpm exec playwright test e2e/client/uploads.spec.ts`
- Dev server: `pnpm dev`; container: `docker compose up --build`

The e2e suite needs `src/web/.env.e2e` (keys in `.env.e2e.example`) and a
running CMS.

## Architecture

- Login is Auth.js against the NBN:ID OIDC server (`src/auth.ts`), with
  database sessions. Each login stores the user's full claim set in Redis.
- Data is Drizzle on MariaDB; `src/db/schema.ts` is the source of truth.
  Other components read these tables directly.
- Uploads are written to `DATA_DIR/<username>/<appid>-<serial as 4 hex>.zip`.
  That path is the public download path, so the layout is a contract.
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

- App code comments: none by default. Only a why the code cannot show, one
  or two lines above the function. Tests may comment freely.
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
