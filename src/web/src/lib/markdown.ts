import "server-only";
import type { AppId } from "./apps";
import { appView, catalogueView, publicAppIdByAlias, type AppView, type CatalogueView } from "./catalogue";
import { liveCategories, type Category } from "./categories";
import { liveFeature, type LiveFeature } from "./featured";
import {
  API_IP_PER_MINUTE,
  API_JSON_BODY_MAX,
  API_KEY_PER_MINUTE,
  API_RELEASE_BODY_MAX,
  API_REQUEST_WINDOW_SECONDS,
  API_SCREENSHOT_BODY_MAX,
  catalogueHref,
  CHANGELOG_MAX,
  DESCRIPTION_MAX,
  formatDay,
  INSTALL_DIR_BANNED,
  INSTALL_DIR_MAX,
  parsePage,
  parseQuery,
  releaseFileName,
  MAX_IMAGE_PIXELS_TEXT,
  MAX_SCREENSHOT_TEXT,
  MAX_UNPACKED_TEXT,
  MAX_UPLOAD_TEXT,
  SCREENSHOT_SLOTS,
  TITLE_MAX,
  UPLOADS_PER_HOUR,
  VERSION_MAX,
} from "./rules";

function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

// At the start of a line, these would begin a list or a heading underline.
function escapeParagraph(text: string): string {
  return escapeText(text).replace(/^([-+=]|\d+[.)])/, "\\$1");
}

function link(text: string, href: string): string {
  return `[${escapeText(text)}](${href})`;
}

// A fence longer than any run of backticks in the text, so the text cannot end it.
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function categoryLinks(categories: Category[]): string {
  return categories.map((category) => link(category.name, `/catalogue/${category.slug}.md`)).join(", ");
}

function catalogueMarkdown(view: CatalogueView, page: number, query: string): string {
  const base = view.category ? `/catalogue/${view.category.slug}.md` : "/catalogue.md";
  const lines = [`# ${escapeText(view.category?.name ?? "Apps")}`, ""];
  if (query !== "") {
    lines.push(`Search: ${escapeText(query)}`, "");
  }
  if (view.categories.length > 0) {
    lines.push("## Categories", "");
    lines.push(...view.categories.map((category) => `- ${link(category.name, `/catalogue/${category.slug}.md`)}`), "");
  }
  lines.push("## Apps", "");
  if (view.rows.length === 0) {
    lines.push("No apps to show.", "");
  }
  for (const row of view.rows) {
    const publisher = row.username ? ` by ${escapeText(row.username)}` : "";
    const categories = row.categories.length > 0 ? `. Categories: ${categoryLinks(row.categories)}` : "";
    lines.push(
      `- ${link(row.title, `/catalogue/${row.id}.md`)}${publisher}: version ${escapeText(row.version)}, ${formatDay(row.releaseDate)}, ${row.downloads} downloads${categories}`,
    );
  }
  if (view.rows.length > 0) {
    lines.push("");
  }
  const pages = [];
  if (page > 1) {
    pages.push(link("Previous page", catalogueHref(base, query, page - 1)));
  }
  if (view.more) {
    pages.push(link("Next page", catalogueHref(base, query, page + 1)));
  }
  if (pages.length > 0) {
    lines.push(pages.join(" | "), "");
  }
  return lines.join("\n");
}

function appMarkdown({ app, releases, categories, screenshots }: AppView): string {
  const latest = releases[0];
  const lines = [`# ${escapeText(app.title)}`, ""];
  if (app.username) {
    lines.push(`Publisher: ${escapeText(app.username)}`, "");
  }
  if (categories.length > 0) {
    lines.push(`Categories: ${categoryLinks(categories)}`, "");
  }
  if (app.description) {
    lines.push(escapeParagraph(app.description), "");
  }
  lines.push(
    `- Latest version: ${escapeText(latest.version)}`,
    `- Release date: ${formatDay(latest.releaseDate)}`,
    `- Download count: ${app.downloads}`,
    `- Download: ${link(releaseFileName(app.id, latest.serial), `/catalogue/${app.id}/download`)}`,
    "",
  );
  if (screenshots.length > 0) {
    lines.push("## Screenshots", "");
    for (const shot of screenshots) {
      const name = shot.slot === 1 ? "Main screenshot" : `Screenshot ${shot.slot}`;
      lines.push(`- ${link(name, shot.url)}: ${shot.width}x${shot.width === 320 ? 256 : 192} PNG`);
    }
    lines.push("");
  }
  lines.push("## Releases", "");
  for (const release of releases) {
    lines.push(`### Version ${escapeText(release.version)}, ${formatDay(release.releaseDate)}`, "");
    if (release.changelog) {
      lines.push(fenced(release.changelog), "");
    }
  }
  return lines.join("\n");
}

function homeMarkdown(feature: LiveFeature | null, spun: AppId | null): string {
  const lines = ["# SPUN", ""];
  if (feature) {
    lines.push(
      `## Featured: ${escapeText(feature.title)}`,
      "",
      feature.article,
      "",
      link(feature.title, `/catalogue/${feature.appId}.md`),
      "",
    );
  }
  if (spun) {
    lines.push(
      "## Install SPUN",
      "",
      link("Download the SPUN zip", `/catalogue/${spun}/download`),
      "",
      "On the Next, you can also run `.nbnget /dot/spun : ../spun get spun`. It downloads the SPUN dot command from the NBN CDN into the current directory, then runs it to install SPUN with SPUN.",
      "",
    );
  }
  lines.push("## Catalogue", "", link("Browse the catalogue", "/catalogue.md"), "");
  return lines.join("\n");
}

function llmsText(categories: Category[]): string {
  return [
    "# SPUN",
    "",
    "> SPUN is the package manager for the ZX Spectrum Next. This site is its catalogue: anyone can browse and search the apps that publishers upload, and download the latest release of each.",
    "",
    "Every public page of the site has a Markdown copy at its URL plus `.md`. The links below go to these copies.",
    "",
    "## Catalogue",
    "",
    `- ${link("All apps", "/catalogue.md")}: every public app by title, with its publisher, latest version, release date, download total and categories. 20 apps to a page; \`?page=N\` gives page N.`,
    "",
    "## Categories",
    "",
    ...categories.map((category) => `- ${link(category.name, `/catalogue/${category.slug}.md`)}: the catalogue with only this category.`),
    "",
    "## Search",
    "",
    "- `/catalogue.md?q={text}`: the apps whose title or description contains the text, in any case. `/catalogue/{category}.md?q={text}` searches in one category. `?page=N` works here too.",
    "",
    "## App pages",
    "",
    "- `/catalogue/{id}.md`: one app, with its publisher, description, categories, download total and every live release with its changelog. The catalogue links each app. An app id is 6 lowercase letters and digits, and a category slug never is, so `/catalogue/{x}` is an app when `x` has that form and a category otherwise.",
    "",
    "## Downloads",
    "",
    "- `/catalogue/{id}/download`: the zip of the app's latest release. Older releases have no web download.",
    "",
    "## API",
    "",
    `- ${link("SPUN API", "/api.md")}: how an agent with a user's API key works with that user's apps. Each request is signed with the key.`,
    `- ${link("spun-publish", "https://github.com/StalePixels/agent-skills/tree/main/spun-publish")}: an Agent Skill for publishing apps on SPUN, with a script that signs requests.`,
    "",
  ].join("\n");
}

// Made at build time: nothing in it comes from the database or the environment.
function apiText(): string {
  const minutes = API_REQUEST_WINDOW_SECONDS / 60;
  return [
    "# SPUN API",
    "",
    "The API lets an agent act for a SPUN user on that user's apps. Every request is signed with the user's API key. The examples use paths only: put the address of this site in front of each one.",
    "",
    "## API keys",
    "",
    "A user makes a key on `/me/keys`, the API keys tab of the account page that the user name in the navbar links to. A user needs a username before they can make a key. The CMS shows the key once, when it is made, and never again. The user can delete a key on the same page; a deleted key stops working at once.",
    "",
    "A key is one string: `nbnspun-<key id>-<secret>`.",
    "",
    "- The key id is 16 characters from `0-9a-z`.",
    "- The secret is 64 hex characters, `0-9a-f`.",
    "",
    "Split the string at its dashes: the second part is the key id, the third the secret. Never send the secret. It only signs requests.",
    "",
    "## Signing a request",
    "",
    "Send these four headers with every request:",
    "",
    "- `X-SPUN-Key`: the key id.",
    "- `X-SPUN-Timestamp`: the time now, in Unix seconds.",
    "- `X-SPUN-Nonce`: 16 to 64 random characters from `A-Za-z0-9`. Make a new one for each request.",
    "- `X-SPUN-Signature`: the HMAC-SHA256 of the signed text, in hex. The HMAC key is the secret, as its 64 characters of text.",
    "",
    "The signed text is four lines, joined by a line feed (`\\n`), with no line feed at the end:",
    "",
    "1. The method, in capitals, for example `GET`.",
    "2. The path with its query string, exactly as sent, for example `/api/apps`.",
    "3. The timestamp, exactly as in `X-SPUN-Timestamp`.",
    "4. The nonce, exactly as in `X-SPUN-Nonce`.",
    "",
    "The body is not signed. Use HTTPS, which protects it.",
    "",
    `The server refuses a timestamp more than ${minutes} minutes from its own time, and a nonce that the same key used in the last ${minutes} minutes.`,
    "",
    "An example with openssl and curl:",
    "",
    "```sh",
    "SITE=https://...  # the address of this site",
    "KEY=nbnspun-...   # the key from /me/keys",
    "KEY_ID=$(printf '%s' \"$KEY\" | cut -d- -f2)",
    "SECRET=$(printf '%s' \"$KEY\" | cut -d- -f3)",
    "METHOD=GET",
    "REQUEST_PATH=/api/apps",
    "TIMESTAMP=$(date +%s)",
    "NONCE=$(openssl rand -hex 16)",
    "SIGNATURE=$(printf '%s\\n%s\\n%s\\n%s' \"$METHOD\" \"$REQUEST_PATH\" \"$TIMESTAMP\" \"$NONCE\" \\",
    "  | openssl dgst -sha256 -hmac \"$SECRET\" | sed 's/^.* //')",
    "curl -sS -X \"$METHOD\" \"$SITE$REQUEST_PATH\" \\",
    "  -H \"X-SPUN-Key: $KEY_ID\" \\",
    "  -H \"X-SPUN-Timestamp: $TIMESTAMP\" \\",
    "  -H \"X-SPUN-Nonce: $NONCE\" \\",
    "  -H \"X-SPUN-Signature: $SIGNATURE\"",
    "```",
    "",
    "## Responses",
    "",
    "Every response is JSON. A success is `200`, or `201` when the call made something. An error is `{ \"error\": { \"code\": \"...\" } }`, with the same codes the CMS forms use. Some errors carry more fields, for example `max`.",
    "",
    "- `400`: the input breaks a rule. The code says which.",
    "- `401`: the request was refused. The code is one of:",
    "  - `api.missingHeader`: one of the four headers is missing or not in its form.",
    `  - \`api.oldRequest\`: the timestamp is more than ${minutes} minutes from the server's time.`,
    "  - `api.badKey`: the key is unknown or deleted, or its user is disabled or has no username.",
    "  - `api.badSignature`: the signature does not match the request.",
    "  - `api.nonceUsed`: the key already used this nonce.",
    "- `403`, `api.termsNotAccepted`: the key's user has not accepted the current terms and conditions. Every call is refused until the user accepts them on the web, at `/terms`.",
    "- `404`: not found.",
    "- `411`, `api.lengthRequired`: a `POST` or `PUT` request, or a request with a chunked body, has no `Content-Length` header.",
    "- `413`, `api.bodyTooLarge`: the body is larger than the call permits. `max` is the limit in bytes.",
    "- `429`, `api.tooManyRequests`: a rate limit was reached. The `Retry-After` header gives the seconds to wait.",
    `- \`429\`, \`upload.tooMany\`: the user has made ${UPLOADS_PER_HOUR} uploads this hour. \`max\` gives the limit, and \`wait\` and the \`Retry-After\` header the seconds until the next hour.`,
    "",
    "## Limits",
    "",
    `- Body size: ${API_JSON_BODY_MAX} bytes for a JSON call, ${API_RELEASE_BODY_MAX} bytes for a release upload, ${API_SCREENSHOT_BODY_MAX} bytes for a screenshot upload.`,
    `- ${API_IP_PER_MINUTE} requests a minute from one IP address, signed or not.`,
    `- ${API_KEY_PER_MINUTE} requests a minute with one key.`,
    `- ${UPLOADS_PER_HOUR} uploads an hour for each user, releases and screenshots together. The uploads of all the user's keys and of the web forms count together.`,
    "",
    "## Calls",
    "",
    "### GET /api/apps",
    "",
    "The user's apps that are not deleted, public or not, by title.",
    "",
    "```json",
    '{ "apps": [{ "id": "abc123", "title": "My App" }] }',
    "```",
    "",
    "### GET /api/categories",
    "",
    "The categories an app can be in, with the id that `POST /api/apps` and `PUT /api/apps/{id}` take.",
    "",
    "```json",
    '{ "categories": [{ "id": 1, "name": "Games" }] }',
    "```",
    "",
    "### GET /api/apps/{id}",
    "",
    "One of the user's apps: its title, description, suggested install directory (`null` when there is none) and category ids, all its releases, newest first, deleted ones too, and its screenshots. `deletedDay` is the day a release was deleted, or `null`. `404`, `app.notFound`: no such app, it is deleted, or it is another user's.",
    "",
    "```json",
    "{",
    '  "id": "abc123",',
    '  "title": "My App",',
    '  "description": "What it does.",',
    '  "installDir": "/apps/myapp",',
    '  "categories": [1],',
    '  "releases": [{ "serial": 1, "version": "1.0", "releaseDate": "2026-10-02", "deletedDay": null }],',
    '  "screenshots": [{ "slot": 1, "width": 256, "url": "/catalogue/abc123/screenshots/1?v=1759400000000" }]',
    "}",
    "```",
    "",
    "### POST /api/apps",
    "",
    "Makes an app. The body is JSON:",
    "",
    "```json",
    '{ "title": "My App", "description": "What it does.", "installDir": "/apps/myapp", "categories": [1] }',
    "```",
    "",
    `- \`title\`: 1 to ${TITLE_MAX} characters of printable ASCII (space to \`~\`).`,
    `- \`description\`: up to ${DESCRIPTION_MAX} characters of printable ASCII, so no line breaks. It can be empty.`,
    `- \`installDir\`: the directory where SPUN on the Next installs the app the first time. The user can change it, and it is not used after the first install. If it is missing or empty, the server uses the install directory of the chosen categories. The server stores it in one form: \`\\\` becomes \`/\`, it starts with \`/\`, repeated slashes become one, and a slash at the end goes, so \`apps\\myapp\\\` is stored as \`/apps/myapp\`. Up to ${INSTALL_DIR_MAX} characters in that form. It is printable ASCII (space to \`}\`), and it cannot have a colon (so no drive letter), a \`.\` or \`..\` part, a part that ends with a dot or a space, or any of \`" * ? < > | ~\`. It cannot be \`/\`, or be in or under ${INSTALL_DIR_BANNED.slice(1).map((dir) => `\`${dir}\``).join(", ")}, in any case.`,
    "- `categories`: category ids from `GET /api/categories`, at least one. Unknown ids are left out.",
    "",
    "A field that is missing or of the wrong type counts as empty, as does a body that is not a JSON object.",
    "",
    'The answer is `201` and `{ "id": "abc123" }`. An app is public when it has a release that is not deleted.',
    "",
    "Errors, all `400`: `title.length`, `title.invalidCharacters`, `description.length`, `description.invalidCharacters`, `installDir.drive`, `installDir.invalidCharacters`, `installDir.dots`, `installDir.partEnd`, `installDir.banned`, `installDir.length`, `category.missing`, and `app.limitReached` when the user has as many apps as their limit permits (`limit` gives the limit).",
    "",
    "### PUT /api/apps/{id}",
    "",
    "Changes an app's title, description, suggested install directory and categories. The body is the same JSON as for `POST /api/apps`, with all four fields: a field left out is made empty. The answer is `200` and `{}`. Errors: those of `POST /api/apps` except `app.limitReached`, and `404`, `app.notFound`.",
    "",
    "### DELETE /api/apps/{id}",
    "",
    "Deletes an app and takes its release files off the server. The app id cannot be used again. The answer is `200` and `{}`. `404`, `app.notFound`: no such app, it is already deleted, or it is another user's.",
    "",
    "### POST /api/apps/{id}/releases",
    "",
    "Uploads a zip as a new release of one of the user's apps. The body is `multipart/form-data`, the same fields the CMS upload form sends:",
    "",
    `- \`version\`: 1 to ${VERSION_MAX} characters from \`A-Za-z0-9_.,#-\`. No two releases of an app can have the same version, deleted ones included, and capitals do not make a version different.`,
    "- `releaseDate`: optional, `YYYY-MM-DD`, for a historic release. It cannot be after today. Left out or empty, it is the upload date.",
    `- \`changelog\`: optional, up to ${CHANGELOG_MAX} characters of printable ASCII and line feeds.`,
    `- \`file\`: the zip, up to ${MAX_UPLOAD_TEXT}. The Next must be able to unzip it. The files in it may add up to at most ${MAX_UNPACKED_TEXT} unpacked (\`file.unpackedTooLarge\`). Each name in the zip must be printable ASCII (space to \`}\`) without any of \`" * < > ? | ~\`, and no part of a name may end with a dot or a space; otherwise the zip is refused with \`file.badNames\`, and \`names\` lists the names to fix. An entry must not carry a second, Unicode name (the Info-ZIP Unicode Path field) that differs from its own name, as the Next uses only its own name; otherwise the zip is refused with \`file.twoNames\`, and \`names\` lists those entries. The zip must not hold macOS files: anything in a \`__MACOSX\` directory, a \`.DS_Store\` file or a file whose name starts with \`._\`, at any depth; otherwise it is refused with \`file.macFiles\`, and \`names\` lists them (a \`__MACOSX\` directory once). The files must be at the root of the zip: when every entry is inside one top-level directory, the zip is refused with \`file.oneDirectory\`, and \`names\` gives that directory.`,
    "",
    "Sign the request as usual: the body is not in the signature. With curl:",
    "",
    "```sh",
    "curl -sS -X POST \"$SITE/api/apps/abc123/releases\" \\",
    "  -H \"X-SPUN-Key: $KEY_ID\" -H \"X-SPUN-Timestamp: $TIMESTAMP\" \\",
    "  -H \"X-SPUN-Nonce: $NONCE\" -H \"X-SPUN-Signature: $SIGNATURE\" \\",
    "  -F version=1.0 -F changelog='First release.' -F file=@game.zip",
    "```",
    "",
    "A file at the root of the zip (no `/` in its name) whose name ends `.dot`, in any case, is a dot command. After the Next installs or updates the app, `.spun` moves it to `C:/dot/` without the extension: `wifi.dot` goes to `C:/dot/wifi`. The names of the dot commands the Next already has, and `spun`, are reserved: the zip is refused with `file.dotCommandTaken` when such a name, without the extension, is reserved, in any case, unless an admin has given this app an override for that name. `names` lists those names. The zip is also refused with `file.dotNameEnd` when such a name, without the extension, ends with a dot or a space, as `LS .dot` does; `names` lists those names.",
    "",
    'The answer is `201` and `{ "serial": 1, "dotMoves": [{ "file": "wifi.dot", "to": "C:/dot/wifi" }] }`, with one item in `dotMoves` for each dot command at the root of the zip that will be moved on install; it is empty when there is none. Serials count up from 1 and are never used again. The zip is then public on SPUNServer, at the `path` that `GET /api/apps/{id}/releases/{serial}` gives. Each upload counts towards the upload limit.',
    "",
    "Errors, all `400` except `app.notFound` (`404`): `version.length`, `version.invalidCharacters`, `version.taken`, `releaseDate.invalid`, `releaseDate.future`, `changelog.length`, `changelog.invalidCharacters`, `file.missing`, `file.tooLarge`, `file.notZip` (not a readable zip), `file.incompatible` (a zip the Next cannot unzip), `file.unpackedTooLarge`, `file.badNames`, `file.twoNames`, `file.macFiles`, `file.oneDirectory`, `file.dotCommandTaken`, `file.dotNameEnd`, `upload.tooMany` (`429`), `app.releasesFull`, and `app.notFound`: no such app, it is deleted, or it is another user's.",
    "",
    "### GET /api/apps/{id}/releases/{serial}",
    "",
    "One release of one of the user's apps, deleted or not. `deletedDay` is the day it was deleted, or `null`. `path` is the zip's path on the SPUN download server, SPUNServer, not on this site. `files` lists the names in the zip; it is `null` for a deleted release, or when the zip cannot be read. `dotMoves` is as in the upload answer; it is empty when `files` is `null`.",
    "",
    "```json",
    "{",
    '  "appTitle": "My App",',
    '  "serial": 1,',
    '  "version": "1.0",',
    '  "releaseDate": "2026-10-02",',
    '  "changelog": "First release.",',
    '  "deletedDay": null,',
    '  "path": "/Publisher/abc123-0001.zip",',
    '  "files": ["README.TXT", "GAME/MAIN.BAS", "wifi.dot"],',
    '  "dotMoves": [{ "file": "wifi.dot", "to": "C:/dot/wifi" }]',
    "}",
    "```",
    "",
    "`404`: `app.notFound` for the app, as above, or `release.notFound`: the app has no release with this serial.",
    "",
    "### PUT /api/apps/{id}/releases/{serial}/changelog",
    "",
    "Changes the changelog of a release. The body is JSON:",
    "",
    "```json",
    '{ "changelog": "Fixed the border.\\nAdded sound." }',
    "```",
    "",
    "An empty or missing `changelog` removes it. The answer is `200` and `{}`. Errors: `changelog.length` and `changelog.invalidCharacters` (`400`), `app.notFound`, and `release.notFound` when the release does not exist or is deleted (`404`).",
    "",
    "### DELETE /api/apps/{id}/releases/{serial}",
    "",
    "Deletes a release and takes its zip off the server. Its serial and version cannot be used again. The answer is `200` and `{}`. `404`: `app.notFound`, or `release.notFound` when the release does not exist or is already deleted.",
    "",
    "### PUT /api/apps/{id}/screenshots/{slot}",
    "",
    `Adds or replaces the screenshot in a slot of one of the user's apps. \`slot\` is 1 to ${SCREENSHOT_SLOTS}; slot 1 is the main screenshot. The body is \`multipart/form-data\` with one field, \`file\`, up to ${MAX_SCREENSHOT_TEXT}:`,
    "",
    `- a PNG, JPEG, GIF or WebP image of up to ${MAX_IMAGE_PIXELS_TEXT} (width times height), which the CMS converts to the Next's NXI format, 256×192 or 320×256; or`,
    "- a ready NXI file, with a name that ends `.nxi`: 49,664 bytes (256×192) or 82,432 bytes (320×256), with its palette first.",
    "",
    "With curl, signed as for a release upload:",
    "",
    "```sh",
    "curl -sS -X PUT \"$SITE/api/apps/abc123/screenshots/1\" \\",
    "  -H \"X-SPUN-Key: $KEY_ID\" -H \"X-SPUN-Timestamp: $TIMESTAMP\" \\",
    "  -H \"X-SPUN-Nonce: $NONCE\" -H \"X-SPUN-Signature: $SIGNATURE\" \\",
    "  -F file=@title.png",
    "```",
    "",
    'The answer is `200` and `{ "slot": 1, "width": 256 }`, where `width` is the width of the NXI. The image is then public at the `url` that `GET /api/apps/{id}` gives. Each upload counts towards the upload limit.',
    "",
    `Errors: \`screenshot.missing\`, \`screenshot.tooLarge\`, \`screenshot.notImage\` (not an image the CMS can read), \`screenshot.tooManyPixels\` (an image over ${MAX_IMAGE_PIXELS_TEXT}) and \`screenshot.badNxi\` (an \`.nxi\` file of the wrong size), all \`400\`; \`upload.tooMany\`, \`429\`; \`app.notFound\`, and \`screenshot.notFound\` for a slot outside 1 to ${SCREENSHOT_SLOTS}, both \`404\`.`,
    "",
    "### DELETE /api/apps/{id}/screenshots/{slot}",
    "",
    `Clears a slot and deletes its files. The answer is \`200\` and \`{}\`. \`404\`: \`app.notFound\`, or \`screenshot.notFound\` when the slot is empty or outside 1 to ${SCREENSHOT_SLOTS}.`,
    "",
    "### GET /api/saved",
    "",
    "The apps the user saved, newest save first. Only public apps are listed. Each has its publisher, latest version and release date, download total, categories and main screenshot.",
    "",
    "```json",
    "{",
    '  "saved": [',
    "    {",
    '      "id": "abc123",',
    '      "title": "My App",',
    '      "username": "Publisher",',
    '      "version": "1.0",',
    '      "releaseDate": "2026-10-02",',
    '      "downloads": 0,',
    '      "categories": [{ "id": 1, "slug": "games", "name": "Games" }],',
    '      "screenshot": null',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "### PUT /api/saved/{id}",
    "",
    "Saves a public app, the user's own or another user's. Saving an app that is already saved changes nothing. There is no body, but the request still needs `Content-Length: 0`; with curl, add `-d ''`. The answer is `200` and `{}`. `404`, `app.notFound`: no such app, or it is not public.",
    "",
    "### DELETE /api/saved/{id}",
    "",
    "Removes an app from the user's saved apps. The answer is `200` and `{}`, also when the app was not saved.",
    "",
  ].join("\n");
}

function markdownResponse(text: string | null): Response {
  if (text === null) {
    return new Response(null, { status: 404 });
  }
  return new Response(text, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}

// Repeated parameters give an array, as in the searchParams of a page, so both
// read the query string the same way.
// For an old URL: a permanent redirect to its new path, with the same query.
export function movedResponse(path: string, request: Request): Response {
  return new Response(null, { status: 308, headers: { Location: `${path}${new URL(request.url).search}` } });
}

export async function catalogueResponse(slug: string | null, request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const value = (name: string) => {
    const all = params.getAll(name);
    return all.length > 1 ? all : all[0];
  };
  const page = parsePage(value("page"));
  const query = parseQuery(value("q"));
  const view = await catalogueView(slug, page, query);
  return markdownResponse(view ? catalogueMarkdown(view, page, query) : null);
}

export async function appResponse(id: string): Promise<Response> {
  const view = await appView(id);
  return markdownResponse(view ? appMarkdown(view) : null);
}

export async function homeResponse(): Promise<Response> {
  return markdownResponse(homeMarkdown(await liveFeature(), await publicAppIdByAlias("spun")));
}

export function apiResponse(): Response {
  return markdownResponse(apiText());
}

export async function llmsResponse(): Promise<Response> {
  return new Response(llmsText(await liveCategories()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
