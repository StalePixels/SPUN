---
name: spun-publish
description: Publishes software for the ZX Spectrum Next on SPUN, the Next's package manager, through the SPUN API with the user's API key. Use it to create or change a SPUN app, upload a release zip, add screenshots or save apps.
license: MIT
---

# Publish on SPUN

SPUN is the package manager for the ZX Spectrum Next. Its site, the CMS, is where publishers make apps and upload releases. The CMS has an API: with the user's API key, you can do everything with the user's apps that the user can do on the site.

The site is `https://spun.nextbestnetwork.com`, unless the user names another.

## Read the current API first

This skill does not describe the API calls. The site does, and it is always current. Before you start, read these two pages on the site:

- `/llms.txt`: what the site has, with links.
- `/api.md`: the key, how to sign a request, every API call, its fields, its answers and its error codes.

Follow `/api.md` where it differs from this skill.

## Get the user's API key

You cannot make a key. Ask the user for one:

1. The user logs in on the site and clicks their username in the navbar. This opens `/me`, their account page.
2. On `/me`, the user opens the API keys tab, `/me/keys`, and makes a key. They need a username before they can make one.
3. The site shows the key once. It is one string, `nbnspun-<key id>-<secret>`. The user copies it and gives it to you, for example in the environment variable `SPUN_KEY`.

The key lets anyone who has it act as the user. Do not write it into files, commits or logs.

## Send requests with scripts/spun.sh

`scripts/spun.sh` signs a request with the key and sends it with curl:

```sh
SPUN_KEY=nbnspun-... scripts/spun.sh METHOD PATH [curl options...]
```

- `SPUN_KEY`: the user's key.
- `SPUN_SITE`: the site, only if it is not `https://spun.nextbestnetwork.com`.
- `PATH` is the path with its query, for example `/api/apps`.
- The curl options carry the body: `-H 'Content-Type: application/json' -d '{...}'` for JSON, `-F name=value` and `-F file=@name.zip` for an upload.
- Add `-i` to see the HTTP status and headers.

Each run makes a new timestamp and nonce, so you can run the same command again.

## The order of the work

1. **Categories.** Get the categories and choose the ids that fit the software. An app needs at least one.
2. **Create the app.** Give it a title, a description and its categories, and a suggested install directory (`installDir`, see below). Keep the app id the answer gives you. If the app already exists, list the user's apps and use its id. A change to an existing app sends all its fields again: a field left out is made empty.
3. **Upload a release.** Upload the zip with its version, and a changelog if there is one. The app becomes public when it has a release.
4. **Add screenshots.** Slot 1 is the main screenshot. Add more in the other slots if the user has them. An image may have at most 4 megapixels, width times height (`screenshot.tooManyPixels`); the Next shows 320×256 at most, so scale a larger image down first.
5. **Save apps.** If the user asks, save apps to their list, or remove them from it.

## The suggested install directory

`installDir` is the directory where SPUN on the Next installs the app the first time. The user can change it, and SPUN does not use it after the first install. Leave it out, or empty, to use the install directory of the chosen categories.

The CMS stores it in one form: `\` becomes `/`, it starts with `/`, repeated slashes become one, and a slash at the end goes. `apps\wifi\spun` and `/apps/wifi/spun/` are both stored as `/apps/wifi/spun`. It refuses a directory that breaks any of these rules:

- Up to 64 characters, in the stored form (`installDir.length`).
- No colon, so no drive letter (`installDir.drive`).
- Only printable ASCII (space to `}`), and none of `" * ? < > | ~` (`installDir.invalidCharacters`).
- No `.` or `..` part (`installDir.dots`).
- No part that ends with a dot or a space, such as `/games./x` (`installDir.partEnd`).
- Not `/`, and not `/nextzxos`, `/sys`, `/dot` or `/machines` or anything under them, in any case (`installDir.banned`).

## What the CMS checks before it accepts a release

Check the zip and the version before you upload. The CMS refuses a release that breaks any of these rules, with the error code shown.

### The version

- 1 to 16 characters (`version.length`).
- Only `A-Z`, `a-z`, `0-9` and `_ . , # -` (`version.invalidCharacters`).
- Different from every earlier version of the app, deleted releases included. Capitals do not count: `1.0A` and `1.0a` are the same version (`version.taken`).

### The zip

The Next unzips each release itself, with its own unzipper. The CMS refuses a zip that this unzipper cannot unzip (`file.incompatible`) or that is not a readable zip (`file.notZip`):

- At most 4 MB (`file.tooLarge`).
- The files in it add up to at most 16 MB unpacked (`file.unpackedTooLarge`).
- One file, not split across several disks or parts.
- Fewer than 65535 entries.
- No ZIP64 records: no entry, and no zip, too large for the normal zip fields.
- Each entry is stored (method 0) or deflated (method 8). No other compression method.
- No encryption.
- Each name is 1 to 252 bytes long.
- No name starts with `/` or `\`, contains `:`, or has a `..` part.

The CMS also refuses a zip with a name that is not printable ASCII (space to `}`), that has any of `" * < > ? | ~`, or that has a part ending with a dot or a space, such as `GAME./A.TXT` (`file.badNames`). The error lists those names in `names`.

The Next reads only the name stored in each entry. Some zip tools add a second, Unicode name (the Info-ZIP Unicode Path field). The CMS refuses an entry whose second name differs from its own (`file.twoNames`), and lists those entries in `names`. Plain ASCII names never need one.

The files go at the root of the zip. The CMS refuses a zip whose entries are all inside one top-level directory, such as `mygame/` (`file.oneDirectory`), and gives that directory in `names`. Zip the contents of the directory, not the directory itself.

The CMS refuses a zip with macOS files: anything in a `__MACOSX` directory, a `.DS_Store` file, or a file whose name starts with `._`, at any depth (`file.macFiles`). The error lists them in `names`, with a `__MACOSX` directory once. On macOS, run this inside the directory to leave them out: `zip -r -X ../mygame.zip . -x '*.DS_Store' '*__MACOSX*' '._*' '*/._*'`.

### Dot commands

A file at the root of the zip whose name ends `.dot`, in any case, is a dot command. After SPUN installs or updates the app on the Next, it moves each one to `C:/dot/` without the extension: `wifi.dot` goes to `C:/dot/wifi`. A `.dot` file in a directory of the zip stays where it is.

The names of the dot commands the Next already ships, such as `ls`, `cd` and `nbnget`, and `spun`, are reserved. The CMS refuses a zip with a root `.dot` file of a reserved name, in any case (`file.dotCommandTaken`), unless an admin has given the app an override for that name. The error lists those names in `names`. If the user maintains such a command, they ask the SPUN admin for an override.

The CMS also refuses a root `.dot` file whose name ends with a dot or a space before `.dot`, such as `LS .dot` (`file.dotNameEnd`). The error lists those names in `names`.

When the CMS accepts the release, the answer lists each move in `dotMoves`. Tell the user about each one.

## The upload limit

Each user may make a set number of uploads an hour, releases and screenshots together; `/api.md` gives the number. Uploads with all of the user's keys and through the web forms count together. Over the limit the answer is `429` with `upload.tooMany`: `wait` and the `Retry-After` header give the seconds until uploads work again. Tell the user, and do not try again before then.

