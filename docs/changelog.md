# Changelog

## 0.9.2 - Unreleased

### `.spun`

- `.spun` can be built with its own name, server, port and colour, for
  your own SPUN server. See "Building `.spun` for your own server" in
  `docs/CMS.md`.
- Apps do not install when they depend on a newer Next core, directly or
  through a dependency. The check covers the whole dependency
  tree and comes before any question or new directory, so a refusal
  changes nothing. `update` skips these apps with a warning.
- The unzip shows the progress of each file, for example
  `DATA.BIN 128K/28.4M`.
- Download and unzip show their progress on the command line too, on one
  line that each update writes over. `-q` hides it.
- While a download or unzip runs in the browser, the status line has the
  bar colour across the screen and the buttons disappear.
- `get` and `update` no longer stop at `scroll?` when their output is
  longer than the screen.

### SPUNServer

- `SPLIST`, and `SPCAT` without search text, leave out hidden apps.
  `SPFIND`, `SPINFO` and downloads still find them.
- `SPINFO` sends an app's minimum core version, when it has one.

### CMS

- The colour of the `spun` theme can be set to match a `.spun` build.
- The app page has tabs: Releases, Dependencies, Screenshots, Details
  and Delete. Each tab has its own URL.
- Dependencies are chosen from a list of the publisher's other apps, or
  found with a search of the public apps, in place of a field of app ids.
  The admin app page has the same picker.
- An app can be hidden in the catalogue. The catalogue lists, on the web
  and on the Next, leave it out. Search, its own page, downloads and
  dependencies still find it. The API and MCP take it as `hidden`.
- Publishers set the minimum core version of their apps, as
  `major.minor.sub`, for example `3.01.10`. Empty means any core. Admins
  edit it with the other app fields. The API (`POST /api/apps` and
  `PUT /api/apps/{id}`, field `minCore`) and the MCP tools `create_app`
  and `update_app` take it, and `GET /api/apps/{id}` and `get_app` return
  it.
- The per-address rate limits find the real client address behind more
  than one proxy.

## 0.9.1 - 20261117

### `.spun`

- `.spun` makes `C:/tmp` when the SD card does not have it. Downloads and
  the screenshot cache are in `C:/tmp`, so without it a get, an update and
  the screenshots failed.

## 0.9.0 - 20261116

### `.spun`

- Apps can depend on other apps. `get` and `update` install each
  dependency that is missing or out of date first, then the app.
- A dependency with no suggested install directory goes into the
  directory of the app that needs it.
- Overwrite "All" covers every dependency of an install, and every app in
  an `update`. Cancel stops the whole install, or the whole `update`.
  Apps installed before the Cancel stay installed.
- A dependency that is no longer on SPUN gives a warning, and the install
  goes on without it.

### SPUNServer

- `SPINFO` sends the number of dependencies of the latest release.
- New command `SPDEPS <id> <serial>` lists the dependencies of a release.
  A `.spun` with dependencies needs a server that has it.
- `LOG baddep=<id>` records a dependency that `.spun` could not find.

### CMS

- Publishers set an app's dependencies on the app page or with
  `PUT /api/apps/{id}/depends`. Each release keeps the list as it was
  when the release was published, so a change reaches the Next with the
  next release.
- Republish makes a new release from the last zip, with a new version and
  changelog, on the app page or with `POST /api/apps/{id}/republish`.
- Admins can edit an app's dependencies, and see which apps need it.
- MCP server at `/mcp`, with a tool for each API call. An MCP client
  connects with the URL and logs in with OAuth on the site, as the
  publisher who allows it.
- `/me/keys` lists the connected MCP clients, and a publisher can
  disconnect each one there.
- The MCP upload tools give a one-time URL. The agent sends the zip or
  the screenshot to it, for example with `curl`.
- The Download button on an app page first shows the line to type on
  the Next to get the app with `.spun`. The zip is still a button there,
  and a tick box stops the message for that browser.

## 0.8.3 - 20261106

### `.spun`

- `.spun` now ensures it's up to date before doing anyting else.

### CMS

- Newest releases now come first in the catalogue, same as in `.spun`.
  Searches still sort by title.
- Forms keep what you typed when validation fails.
- Line breaks are allowed in app descriptions, from the form or the API,
  and each one counts as a single character.

## 0.8.2 - 20261026

### `.spun`

- Filter the browser by category, as on the website: Category (key C)
  lists the categories, and a search then looks only in the chosen one.
  "All" removes the filter.
- BREAK closes the search box. Before, it typed a space.
- The mouse pointer hides when you press a key, and comes back when the
  mouse moves.
- Buttons that do nothing on the current screen are grey, such as Prev on
  the first page, and their keys and clicks do nothing.
- A click works in the search box once the mouse has moved: it closes the
  box and acts on what you clicked.

### SPUNServer

- New commands for the category filter: `SPCATS [page]` lists the
  categories, and `SPCAT <slug> <page> [text]` lists or searches the apps
  in one category. A `.spun` with the category filter needs a server that
  has them.

## 0.8.1 - 20261022

### `.spun`

- Apparently it's cool to get AI to speed up your launcher! Steam and
  Epic are 'teh cool kids', and they did it - and I want to be cool, so...
  Sped up downloads >5%, reduce app size by >10%, sped up startup too!
- Cache and reuse screenshots, for 75% faster viewing of something you
  have seen before.
- During installation or upgrades, the app's name and version show under
  `Name:` and `Version:`, and the zip file's name under `File:`. Before,
  `Name:` showed the file name.

### CMS

- The version, date and download count in the catalogue list are in
  smaller text, so they fit better.
- Screenshot CRC32s now generated at time of upload.

## 0.8.0 - 20261013

### `.spun`

- New look for the question boxes in the GUI (install, overwrite, updates).
  They're in the SPUI style now, with the rainbow stripe on the title bar,
  and the shortcut letter on each button has a colour: green to go ahead,
  red to cancel, yellow for a warning.

### CMS

- The suggested install directory now ends in a folder for the app, so
  `Jet Set Willy` in `/games` suggests `/games/jet-set-willy`. The API does
  the same when `installDir` is left out or blank.
- `.spun` draws colour `0xE3` as transparent, so screenshots don't use it
  any more. The CMS swaps it for `0xE7`, a shade greener, in converted
  images and in uploaded NXI files.
- App pages put the app's name in the page title and carry its
  description, so a link shared on a social network gets a proper preview
  card.
- The light/dark menu in the navbar is now a theme menu. The new SPUN
  theme is the default. NextBestNetwork is the other theme, with Light,
  Dark and Auto in its submenu.
- On an app page, the other screenshots are in a 2x2 grid beside the main
  one. Click a screenshot to see it large.

## 0.7.3 - 20261008

### `.spun`

- `.spun -v` shows the version.

### SPUNServer

- The server records only the client details it knows, at the moment only
  the `.spun` version. It ignores other names.

## 0.7.2 - 20261007

### `.spun`

- `.spun` reports its version, so we can see how popular each version is.

### CMS

- Clearer catalogue list: the app title and the publisher no longer run
  together.

## 0.7.1 - 20261006

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
- `featured` names the app of the current feature on the front page, and
  works wherever an alias does.

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
- The front page shows the featured app: its main screenshot, its title, an
  article in Markdown and a link to the app. `/catalogue/featured` redirects
  to the app, and `/index.md` has the feature too. `featured` is a reserved
  alias and category slug.
- Admins write features at `/admin/featured`. A feature can be saved as a
  draft, published now or at a later time, unpublished and deleted. The
  latest live feature is the one shown. The only live feature cannot be
  unpublished or deleted: `feature.lastLive`.
- An app with no screenshot shows a placeholder image in the catalogue and
  on its page.
- Each category has an install directory and a specificity. On the app
  form, the install directory follows the chosen categories until the
  publisher types in it: the directory of the highest specificity, and on a
  tie the longest one. The categories now come before the install
  directory on the form.
- An app's install directory is compulsory: `installDir.missing`. In the
  API, a missing or empty `installDir` gets the directory of the chosen
  categories.
- An admin app page has a revalidate button. It runs the app checks again,
  and the upload checks on the stored zip of each release that is not
  deleted, and shows the result.

## 0.7.0 - 20261004

### Everything

- First public release!
