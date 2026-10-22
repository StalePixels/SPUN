# Administering SPUN

This page is for site admins. The admin area is at `/admin`. To host SPUN, see [CMS.md](CMS.md). To publish, see [PUBLISHER.md](PUBLISHER.md).

## Who is an admin

Admin is one flag on a user. There are no lesser levels: an admin can do everything in `/admin`.

- The first user who logs in to a new site becomes an admin. Every later user is a normal user.
- An admin sets or clears the flag on the user's page, `/admin/users/<id>`.
- The last enabled admin cannot lose the flag, be disabled or be deleted. The site refuses with `admin.lastAdmin`. Make another admin first.
- Admin rights apply only under `/admin`. Everywhere else an admin is a normal user: an admin edits only their own apps on the publisher pages. To change another user's app, use `/admin/apps`.
- `/admin` looks absent to anyone who is not an admin. The page answers 404, not "forbidden". Every admin page, action and data function checks the flag again on its own (`requireAdmin()` in `src/web/src/lib/admin.ts`).
- An admin must also have accepted the current terms and conditions, like any user.

The admin home page links to the sections below.

## Settings

The default app limit is the number of apps a user can publish when the user has no limit of their own. Empty means no limit. A limit of 0 means the user cannot publish. A limit set on a user's page replaces the default for that user.

## Users

`/admin/users` lists every user with the registration date, the number of apps that are not deleted, the user's own app limit and the admin flag. A user who has not chosen a username yet shows as "Not chosen yet".

A user's page shows the email address, the registration date and the status. From it you can:

- Change the app limit and the admin flag.
- Rename the user.
- Disable or enable the user.
- Delete the user.

### Usernames

A username is permanent for the publisher. The publisher cannot change it; only an admin rename does. A new name follows the same rules as a chosen one: 8 to 16 characters of letters, digits, `-` and `_`, and not already taken. Letter case does not make a name different.

A rename moves the user's directory in the storage directory. The download paths of the user's apps change, and the old paths stop working.

### Disable

A disabled user cannot log in. Disabling also ends the user's sessions at once and stops the user's API keys.

The user's apps stay public and downloadable. A lock-out never breaks installs on a Next. "Enable" lets the user log in again.

### Delete

Deleting a user disables the user and deletes all their apps. The apps go to the recycle bin (see below). The user row stays, so the username stays taken.

The site has no "restore user". "Enable" lets the user log in again, but the apps stay deleted until you restore each of them on its own page.

## Apps

`/admin/apps` lists every app, deleted ones too, with its title, id, owner and number of releases. An app's page, `/admin/apps/<id>`, shows its releases and has these tools:

- **Revalidate.** It runs the checks of an app edit and of a release upload again, on the app and on the stored zip of each release that is not deleted. It reports what fails and changes nothing.
- **Upload a release.** It works like the publisher's form, for any app.
- **Screenshots.** Add, replace or clear a slot. This is not possible while the app is deleted.
- **Title, description, install directory and categories.** The same fields as the publisher's form.
- **Aliases.** See below.
- **Reserved dot commands.** See below.
- **Move to another user.** It gives the app to another user who has a username. The app limit does not apply to a move. The release zips and screenshots move to the new owner's directory, so the download paths change.
- **Delete** and **restore**. See below.

A release has its own page, `/admin/apps/<id>/releases/<serial>`. An admin can edit its version, release date and changelog there. A publisher can edit only the changelog. An admin can also delete and restore a release.

### Aliases

An alias is a short name for an app. `.spun get <alias>` works like `.spun get <id>`.

- An alias has 1 to 16 characters from `a-z`, `0-9`, `-` and `_`. The site stores upper case input in lower case.
- An alias cannot be the id of any app, deleted or not, or another alias. `featured` is reserved.
- You can move an alias to another app. Removing an alias deletes it for good, so the name is free to use again.
- If the alias `spun` points to a public app, the home page shows the download of the SPUN client from that app.

### Reserved dot commands

A dot command is a file at the root of a release zip with a name ending `.dot`. The names of the dot commands that the Next ships, and `spun`, are reserved, and a zip that has one is refused. An override for a name lets the releases of that one app have a dot command with that name. The list of reserved names is in `src/web/src/lib/dotcommands.ts`.

## Delete and restore

A delete never removes a release zip or a screenshot. It marks the row and moves the files to the recycle bin, `STORAGE_DIR/bin`. See [CMS.md](CMS.md) for the file names.

**App.** "Delete" marks the app as deleted and moves the zips of its releases that are not deleted, and its screenshots, to the bin. The app disappears from the catalogue and its files cannot be downloaded. The app id stays taken. "Restore" brings them back.

Each release keeps its own `deleted_at`. An app restore brings back only the releases that were not deleted on their own. A release that someone deleted before the app was deleted stays deleted, and its zip stays in the bin.

**Release.** "Delete" marks the release and moves its zip to the bin. "Restore" on the release page moves it back. While the app is deleted, a release delete only marks the release, because the zip is already in the bin. Restoring such a release clears the mark, and the zip comes back with the app restore.

**Screenshots.** A replace or a clear of a screenshot does not use the bin and cannot be undone. Only an app delete moves screenshots to the bin.

## Categories

`/admin/categories` lists the categories an app can be in. Each has:

- A slug: the URL of the category, `/catalogue/<slug>`. It has up to 16 characters from `a-z`, `0-9` and `-`. It cannot be a page of the site, `featured`, or six letters and digits, which is the form of an app id. A change breaks the old URL.
- A name, up to 32 characters.
- An install directory, which SPUN suggests to an app in this category.
- A specificity, a whole number from 0 to 65535. When an app has several categories, the directory of the category with the highest specificity is suggested. On a tie, the longest directory wins.

A deleted category can be restored. Its slug cannot be used by another category while it is deleted.

## Featured apps

A feature is a short article about a public app. The home page shows the live feature. The name `featured` stands for the app of the live feature, so `/catalogue/featured` and `.spun get featured` use that app.

- The article is Markdown, up to 1024 characters.
- A feature has a publish time, in your time zone. Publishing with no time publishes at once. The database clock decides when a feature is live.
- A feature is live when it is published, not deleted, its time has passed and its app is public. When several are live, the home page shows the latest.
- Unpublish keeps the publish time, so publishing it again puts it back in its place.
- You cannot unpublish, delete or reschedule the only live feature. The site refuses with `feature.lastLive`. Publish another feature first.
- The site has no restore for a deleted feature.

## Terms and conditions

`/admin/terms` has the versions of the terms and conditions, in Markdown up to 16000 characters.

- A version goes live at its publish time. The version that is live is the current one.
- A live version cannot be edited, unpublished or deleted. Write a new version instead.
- When a new version goes live, every user must accept it before they use the site again. Users who log in with an older acceptance are sent to `/terms`. This includes admins.
- A new user accepts the live version when choosing a username.

## Client statistics

`/admin/clients` charts the information that `.spun` clients send to SPUNServer, as stored in the database. Choose the key, whether to count IP addresses or connections, and the number of days. Days are in UTC.

## Revalidate

Revalidate is on each app's page; see Apps above.

## Recycle bin and restores

The recycle bin has no page of its own. A restore is done on the page of the thing that was deleted: an app, a release or a category. Users, features and terms versions have no restore. A deleted user can be enabled again, as described above.
