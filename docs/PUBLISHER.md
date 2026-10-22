# Publishing on SPUN

This page is for people who publish software for the ZX Spectrum Next on SPUN. A publisher makes an app, uploads releases of it as zip files, and adds screenshots. People then find the app in the catalogue, on the web site and in `.spun` on the Next.

## Account and username

You log in with your NBN:ID account. SPUN has no passwords of its own.

The first time you log in, SPUN asks you to choose a username and, if there are terms and conditions, to accept them. You cannot publish before you have done both.

- A username has 8 to 16 characters: letters, digits, `-` and `_`.
- Two usernames that differ only in letter case count as the same name.
- A username is permanent. Only a site admin can rename you, and a rename changes the download paths of all your apps, so ask an admin only when you must.

When the terms and conditions change, you must accept the new version before you can use your account again.

Your account page is `/me`. It shows your username, your email address and how many apps you have of the number you may have.

## Apps

An app is the thing people install. It has a title, a description, categories and a suggested install directory. Make one under "New app" in `/publish`.

- Title: 1 to 32 characters, printable ASCII.
- Description: up to 256 characters, printable ASCII. It can be empty.
- Categories: at least one.
- Install directory: where `.spun` offers to install the app on the Next. It starts as a suggestion from the categories and the title. You can type your own, up to 64 characters. It cannot have a drive letter, `.` or `..`, or be `/`, or be in `/nextzxos`, `/sys`, `/dot` or `/machines`. The person who installs can choose another directory.

SPUN gives each app an id of six lowercase letters and digits, such as `abc123`. People use the id with `.spun get`. An admin can also give an app an alias, a short name that works in its place.

Each user may publish a limited number of apps. The limit is on your account page. An admin sets it. If you have reached it, "New app" says so.

The catalogue lists an app only when it has at least one release that is not deleted.

## Releases

A release is one zip file with a version. Open your app in `/publish` and use "Upload a release".

- Version: 1 to 16 characters from letters, digits and `_ . , # -`. No spaces. For example `1.1-beta`.
- Zip file: up to 4 MB. The files in it add up to at most 16 MB when unpacked.
- Changelog: optional, up to 1024 characters of printable ASCII and line breaks.
- Historic release: tick it if you upload an old version, and enter its original release date. Without it, the release date is the upload date. A release date cannot be in the future.

The site checks the zip on upload and refuses it if it breaks a rule. The error message names the file or the rule that failed. The guide at `/publish/docs` tells you how to make the zip: its layout, the macOS files to leave out, and dot commands. Log in to see it.

What the site does with a release:

- Each release gets a serial number, starting at 1. SPUN offers the release with the highest serial that is not deleted.
- A version can be used once per app, with letter case ignored. This includes the versions of deleted releases.
- A release cannot be changed after the upload, except for its changelog. To fix a zip, upload a new release with a new version.
- Deleting a release takes it out of the catalogue and out of the downloads. The site keeps the file, so an admin can restore the release. You cannot restore a release yourself; ask an admin.

You can upload 20 files an hour, releases and screenshots together. This includes uploads through the API.

### Dot commands

A file at the root of the zip with a name ending `.dot` is a dot command. After the Next unpacks the app, `.spun` moves it to `C:/dot/` without the extension. The names of the dot commands the Next already has, and `spun`, are reserved. The site refuses a zip with a dot command of a reserved name. If your app needs one, ask an admin to give the app an override for that name.

## Screenshots

An app has five screenshot slots. Slot 1 is the main screenshot, shown in lists.

- Upload a PNG, JPEG, GIF or WebP image, or an NXI file. The file can be up to 16 MB, and an image up to 4 megapixels. A screenshot needs no more than 320x256.
- The site converts an image to the NXI format that the Next uses, and keeps a PNG copy for the web site. The site checks an NXI file and keeps it as it is. It must be 49,664 bytes (256x192) or 82,432 bytes (320x256), with its palette first.
- "Replace" overwrites the slot. "Clear" empties it. Neither can be undone.

## Deleting an app

"Delete app" takes the app and all its releases and screenshots out of the catalogue. The site keeps the files, so an admin can restore the app. The app id is never used again, by you or by anyone else. An app you deleted does not count against your app limit.

## API keys and the API

Everything you can do with your apps on the site, you can also do through the API. A script or an AI agent can then publish for you.

- Make a key on the API keys tab of your account page, `/me/keys`. You need a username first. The site shows the key once. Keep it secret: anyone who has it can act as you. Delete a key on the same page and it stops working at once.
- The site describes the API at `/api.md`: how to sign a request, every call, its fields and its error codes.
- A key stops working if an admin disables your account, or if the current terms and conditions have not been accepted. Accept them on the web, at `/terms`.
- The API has rate limits, listed in `/api.md`.

The repository has a ready-made skill for AI agents in `skills/spun-publish`.

## Error codes

The site shows an error in words. Each error also has a code, in the form `area.problem`, such as `file.macFiles` or `version.taken`. The API returns the code in its answer. The words for each code are in `src/web/src/lib/messages.ts`, and the list of codes is in `src/web/src/lib/problems.ts`.

Two codes need an action from outside the form:

- `app.limitReached`: you have as many apps as your limit allows. Delete an app you do not need, or ask an admin to raise the limit.
- `upload.tooMany`: you made too many uploads this hour. The answer says how long to wait.
