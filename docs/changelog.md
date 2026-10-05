# Changelog

## 0.7.1 (not released)

### The SPUN package

- `spun.bas` is a NextBASIC menu. It browses the catalogue, updates the
  installed apps, installs an app by its id or alias, and opens the guide.
  When `spun.dot` is in its directory, it moves the file to `C:/dot/spun`,
  so a package unzipped by hand installs itself.
- `spun.gde` is a NextGuide introduction to SPUN, its menu and the `.spun`
  command.

### `.spun`

- `-q` (quiet) hides progress and status lines, such as `Opening`,
  `Name`/`Size`, `Installing to`, `Installed` and `No updates`. Questions,
  the results of `find` and `info`, the help text and errors still print.
  In the GUI, `-q` also skips the splash screen.

### CMS

- The front page has a download link for the SPUN zip, and the line that
  installs SPUN on the Next itself: `.nbnget /dot/spun : ../spun get spun`.
  Neither needs an account.
- The catalogue is at `/catalogue`, a category at `/catalogue/<slug>` and
  an app at `/catalogue/<id>`. The old addresses (`/?q=`, `/<slug>`,
  `/apps/<id>/...` and their `.md` copies) and `/catalog/...` redirect there
  permanently.
- `/get/<id or alias>` redirects to the app's page. The redirect is
  temporary, because an alias can move to another app.
- Categories show as tabs, with "All" first.
- The top bar has a Catalogue link next to SPUN. The My Apps link is gone.
- The publish area has three tabs: your apps (`/publish`), a new app
  (`/publish/new`), and a guide to making a release zip on Linux, macOS and
  Windows (`/publish/docs`).
- The account page has three tabs: your account (`/me`), your saved apps
  (`/me/apps`, was `/my`) and your API keys (`/me/keys`, was `/keys`). The
  old addresses redirect.
- An upload is refused when the zip has macOS files (`__MACOSX/`,
  `.DS_Store`, `._*`, at any depth): `file.macFiles`. It is also refused
  when all its files are inside one top-level directory:
  `file.oneDirectory`.
- A category slug cannot have the form of an app id, 6 lowercase letters
  and digits: `category.appIdForm`. `catalogue`, `catalog` and `get` are
  reserved slugs.
- In API answers, a screenshot's `url` is
  `/catalogue/<id>/screenshots/<slot>`.
- The CMS can mail one admin address on each change to the catalogue: a new
  app or release, an app or release deleted, an app's details or a
  release's changelog edited, a screenshot changed, and a new publisher.
  Each mail names the user who acted and links to the public and admin
  pages. The SMTP settings and the address are in `.env.example`; with no
  `SMTP_HOST` or `ADMIN_NOTIFY_EMAIL`, no mail is sent.

## 0.7.0 - 20261004

### Everything

- First public release!
