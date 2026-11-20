import {
  CHANGELOG_MAX,
  DEPENDS_MAX,
  DESCRIPTION_MAX,
  INSTALL_DIR_BANNED,
  INSTALL_DIR_MAX,
  MAX_IMAGE_PIXELS_TEXT,
  MAX_SCREENSHOT_TEXT,
  MAX_UNPACKED_TEXT,
  MAX_UPLOAD_TEXT,
  MCP_UPLOAD_TICKET_SECONDS,
  SCREENSHOT_SLOTS,
  TITLE_MAX,
  VERSION_MAX,
} from "./rules";

export const MCP_TOOLS = {
  listCategories: "list_categories",
  listApps: "list_apps",
  getApp: "get_app",
  getRelease: "get_release",
  listSaved: "list_saved",
  createApp: "create_app",
  updateApp: "update_app",
  deleteApp: "delete_app",
  setDepends: "set_depends",
  republishApp: "republish_app",
  setChangelog: "set_changelog",
  deleteRelease: "delete_release",
  deleteScreenshot: "delete_screenshot",
  saveApp: "save_app",
  unsaveApp: "unsave_app",
  uploadRelease: "upload_release",
  uploadScreenshot: "upload_screenshot",
} as const;

// The e2e tests fail when an API route and method has no entry here, or its tool is not served.
export const MCP_TOOL_OF_ROUTE: Record<string, (typeof MCP_TOOLS)[keyof typeof MCP_TOOLS]> = {
  "GET /api/apps": MCP_TOOLS.listApps,
  "GET /api/categories": MCP_TOOLS.listCategories,
  "GET /api/apps/{id}": MCP_TOOLS.getApp,
  "POST /api/apps": MCP_TOOLS.createApp,
  "PUT /api/apps/{id}": MCP_TOOLS.updateApp,
  "PUT /api/apps/{id}/depends": MCP_TOOLS.setDepends,
  "POST /api/apps/{id}/republish": MCP_TOOLS.republishApp,
  "DELETE /api/apps/{id}": MCP_TOOLS.deleteApp,
  "POST /api/apps/{id}/releases": MCP_TOOLS.uploadRelease,
  "GET /api/apps/{id}/releases/{serial}": MCP_TOOLS.getRelease,
  "PUT /api/apps/{id}/releases/{serial}/changelog": MCP_TOOLS.setChangelog,
  "DELETE /api/apps/{id}/releases/{serial}": MCP_TOOLS.deleteRelease,
  "PUT /api/apps/{id}/screenshots/{slot}": MCP_TOOLS.uploadScreenshot,
  "DELETE /api/apps/{id}/screenshots/{slot}": MCP_TOOLS.deleteScreenshot,
  "GET /api/saved": MCP_TOOLS.listSaved,
  "PUT /api/saved/{id}": MCP_TOOLS.saveApp,
  "DELETE /api/saved/{id}": MCP_TOOLS.unsaveApp,
};

export const MCP_SERVER_INFO = { name: "SPUN", version: process.env.SPUN_VERSION ?? "" };

export const MCP_INSTRUCTIONS = [
  "SPUN is the package manager for the ZX Spectrum Next. These tools act for one SPUN user, the one who connected this client, on that user's apps, with everything the user can do with them on the SPUN site.",
  "A tool that fails returns isError with a JSON text: error.code is the problem code, message says what is wrong in English, and some errors carry more fields, for example max or names.",
].join("\n\n");

export const MCP_FIELDS = {
  appId: "The app id: 6 characters from 0-9 and a-z, for example abc123. Capitals do not matter.",
  serial: "The release serial: a whole number from 1. Serials count up from 1 for each app and are never used again.",
  slot: `The screenshot slot: a whole number from 1 to ${SCREENSHOT_SLOTS}. Slot 1 is the main screenshot.`,
  title: `The app's title: 1 to ${TITLE_MAX} characters of printable ASCII (space to ~).`,
  description: `What the app does: up to ${DESCRIPTION_MAX} characters of printable ASCII and line feeds. A CR LF counts as one line feed. Left out, it is empty.`,
  installDir:
    "The suggested install directory, for example /apps/myapp. Left out or empty, SPUN uses the install directory of the chosen categories with a folder for the app under it.",
  minCore:
    "The minimum core version, as major.minor.sub, for example 3.01.10. Left out or empty, the app runs on any core.",
  categories: "Category ids from list_categories, at least one. Unknown ids are left out.",
  hidden: "true to hide the app in the catalogue lists. Left out, it is false.",
  depends: `App ids of other apps on SPUN that are not deleted, any user's, up to ${DEPENDS_MAX}. Not aliases, and not the app itself. An empty or missing list removes every dependency.`,
  version: `The new release's version: 1 to ${VERSION_MAX} characters from A-Z, a-z, 0-9 and _ . , # -. It must differ from every earlier version of the app, deleted releases included; capitals do not count.`,
  changelog: `The changelog: up to ${CHANGELOG_MAX} characters of printable ASCII and line feeds. Left out or empty, there is none.`,
  releaseDate: "The release date, YYYY-MM-DD, for a historic release. It cannot be after today. Left out or empty, it is the upload date.",
};

const APP_FIELD_RULES = [
  `title is 1 to ${TITLE_MAX} characters of printable ASCII (space to ~). description is up to ${DESCRIPTION_MAX} characters of printable ASCII and line feeds; it can be empty.`,
  "categories takes ids from list_categories, at least one; unknown ids are left out.",
  "hidden is true or false; left out, it is false. A hidden app is not in the catalogue lists, on the web or on the Next. Search still finds it, and its own page, downloads and dependencies still work. Use it for the parts of a larger app.",
  "installDir is the directory where SPUN on the Next installs the app the first time. The user can change it on the Next, and it is not used after the first install. Leave it out, or empty, to use the install directory of the chosen categories with a folder for the app under it, named from the title: Jet Set Willy in a category at /games gives /games/jet-set-willy.",
  `SPUN stores installDir in one form: \\ becomes /, it starts with /, repeated slashes become one, and a slash at the end goes, so apps\\myapp\\ is stored as /apps/myapp. It is refused when, in that form, it is over ${INSTALL_DIR_MAX} characters (installDir.length); has a colon, so a drive letter (installDir.drive); has a character that is not printable ASCII (space to }) or is one of " * ? < > | ~ (installDir.invalidCharacters); has a . or .. part (installDir.dots); has a part that ends with a dot or a space, such as /games./x (installDir.partEnd); or is /, or is in or under ${INSTALL_DIR_BANNED.slice(1).join(", ")}, in any case (installDir.banned).`,
  "minCore is the oldest Next core that the app runs on, as major.minor.sub, for example 3.01.10: major and minor from 0 to 15 with one or two digits, sub from 0 to 255 with one to three digits (minCore.format, minCore.range). Left out or empty, the app runs on any core. SPUN on the Next does not install any apps that depend on a newer core, directly or through a dependency.",
];

const APP_FIELD_ERRORS =
  "title.length, title.invalidCharacters, description.length, description.invalidCharacters, installDir.drive, installDir.invalidCharacters, installDir.dots, installDir.partEnd, installDir.banned, installDir.length, minCore.format, minCore.range and category.missing";

const CHANGELOG_RULES = `People read the changelog on the Next, an 8-bit machine, so write it for the Next: short, with the new features and fixes a user will notice, not internal work. Plain ASCII only, no UTF-8, no markdown and no links. Up to ${CHANGELOG_MAX} characters of printable ASCII and line feeds (changelog.length, changelog.invalidCharacters).`;

const VERSION_RULES = `version is 1 to ${VERSION_MAX} characters (version.length) from A-Z, a-z, 0-9 and _ . , # - (version.invalidCharacters). It must differ from every earlier version of the app, deleted releases included, and capitals do not count: 1.0A and 1.0a are the same version (version.taken).`;

const RELEASE_DATE_RULES =
  "releaseDate is YYYY-MM-DD, for a historic release (releaseDate.invalid), and cannot be after today (releaseDate.future). Left out or empty, it is the upload date.";

const TICKET_MINUTES = MCP_UPLOAD_TICKET_SECONDS / 60;

const UPLOAD_URL_RULES = [
  `The URL works for one upload, within ${TICKET_MINUTES} minutes, and stops working when the user disconnects this client. An upload uses it up, also one that the checks then refuse: after an error, fix the cause and get a new URL from this tool. Only two refusals leave the URL working: 413 api.bodyTooLarge (the body is over the limit in max) and 429 api.tooManyRequests (wait for the seconds in the Retry-After header). A 403 api.termsNotAccepted means that the user must accept the current terms on the SPUN site, at /terms. Do not send the user's SPUN access token or API key with the upload; the URL is enough. Do not show the URL to anyone else.`,
  "The upload is counted towards the user's upload limit for each hour, which releases and screenshots share across the SPUN site, the API and these tools.",
];

export function uploadCurl(kind: "release" | "screenshot", url: string): string {
  return `curl -sS -F 'file=@${kind === "release" ? "ZIP_PATH" : "IMAGE_PATH"}' '${url}'`;
}

export const MCP_UPLOAD_FIELDS = {
  release: {
    file: `Required. The zip, up to ${MAX_UPLOAD_TEXT}.`,
  },
  screenshot: {
    file: `Required. A PNG, JPEG, GIF or WebP image of up to ${MAX_IMAGE_PIXELS_TEXT}, or a ready NXI file with a name that ends .nxi, up to ${MAX_SCREENSHOT_TEXT}.`,
  },
};

const UPLOAD_RETURNS = (kind: "release" | "screenshot") =>
  `Returns { "url", "expiresAt", "method": "POST", "fields", "curl" }: the one-time URL; when it stops working (ISO 8601, UTC); the multipart/form-data fields to send to it, each with what it takes; and a curl command that sends them. In the curl command, replace ${kind === "release" ? "ZIP_PATH" : "IMAGE_PATH"}. Run it from a shell that can read the file.`;

export const MCP_DESCRIPTIONS: Record<keyof typeof MCP_TOOLS, string> = {
  listCategories: [
    "Lists the categories an app on SPUN can be in, with the id of each.",
    "Choose categories before you make an app with create_app: an app needs at least one, and create_app and update_app take the ids this tool gives. Unknown ids are left out.",
    "No input.",
    'Returns { "categories": [{ "id": 1, "name": "Games" }] }.',
  ].join("\n\n"),
  listApps: [
    "Lists the user's own apps that are not deleted, public or not, by title.",
    "If the user asks you to work on an app that already exists, find its id here instead of making a new app with create_app.",
    "No input.",
    'Returns { "apps": [{ "id": "abc123", "title": "My App" }] }.',
  ].join("\n\n"),
  getApp: [
    "Gives one of the user's own apps.",
    "Input: id, the app id.",
    "Returns its id, title, description, suggested install directory (installDir, null when there is none), minimum core version (minCore, as major.minor.sub, null when there is none), hidden (true when it is hidden in the catalogue lists), category ids, dependencies (depends: the app ids that SPUN on the Next installs or updates first; set_depends changes them), all its releases, newest first, deleted ones too, and its screenshots.",
    "Each release has serial, version, releaseDate (YYYY-MM-DD) and deletedDay, the day it was deleted or null. An app is public when it has a release that is not deleted.",
    `Each screenshot has slot (1 to ${SCREENSHOT_SLOTS}; slot 1 is the main screenshot), width (256 or 320) and url, a path on the SPUN site.`,
    "installDir is where SPUN on the Next installs the app the first time. The user can change it on the Next, and it is not used after the first install.",
    "Error app.notFound: no such app, it is deleted, or it is another user's.",
  ].join("\n\n"),
  getRelease: [
    "Gives one release of one of the user's own apps, deleted or not.",
    "Input: id, the app id, and serial, the release serial from get_app.",
    "Returns appTitle, serial, version, releaseDate (YYYY-MM-DD), changelog, deletedDay (the day it was deleted, or null), path, files, dotMoves and depends.",
    "path is the zip's path on SPUNServer, the SPUN download server, not on the SPUN site. files lists the names in the zip; it is null for a deleted release, or when the zip cannot be read. depends lists the app's dependencies when the release was made; they never change after that.",
    "A file at the root of the zip whose name ends .dot, in any case, is a dot command. After SPUN on the Next installs or updates the app, it moves each one to C:/dot/ without the extension: wifi.dot goes to C:/dot/wifi. dotMoves lists each such move as { file, to }; it is empty when files is null.",
    "Errors: app.notFound (no such app, it is deleted, or it is another user's) and release.notFound (the app has no release with this serial).",
  ].join("\n\n"),
  listSaved: [
    "Lists the apps the user saved, newest save first. Only public apps are listed; the user's own apps and other users' apps can both be saved.",
    "No input.",
    "Each app has id, title, username (its publisher), version and releaseDate of its latest release, downloads (the download total), categories ({ id, slug, name }) and screenshot (the main screenshot, or null).",
  ].join("\n\n"),
  createApp: [
    "Makes a new app for the user, with no releases. An app is public only when it has a release that is not deleted.",
    "The order of the work: get the category ids with list_categories, check with list_apps that the app does not exist already, make the app here and keep the id it returns, then add a release with upload_release and screenshots with upload_screenshot.",
    "Input: title, description, installDir, minCore, categories and hidden.",
    ...APP_FIELD_RULES,
    'Returns { "id": "abc123" }, the new app id.',
    `Errors: ${APP_FIELD_ERRORS}, and app.limitReached when the user has as many apps as their limit permits (limit gives the limit).`,
  ].join("\n\n"),
  updateApp: [
    "Changes the title, description, suggested install directory, minimum core version, categories and hidden flag of one of the user's apps.",
    "Send all six fields each time: a field left out is made empty or false, and an empty installDir is set again from the categories. An empty minCore removes the minimum. Read the current values with get_app first.",
    "Input: id, the app id, and title, description, installDir, minCore, categories and hidden, as for create_app.",
    ...APP_FIELD_RULES,
    "Returns {}.",
    `Errors: ${APP_FIELD_ERRORS}, and app.notFound (no such app, it is deleted, or it is another user's).`,
  ].join("\n\n"),
  deleteApp: [
    "Deletes one of the user's apps and takes its release files off the SPUN download server. It cannot be undone, and the app id is never used again. Ask the user before you delete an app.",
    "Input: id, the app id.",
    "Returns {}.",
    "Error app.notFound: no such app, it is already deleted, or it is another user's.",
  ].join("\n\n"),
  setDepends: [
    "Sets the dependencies of one of the user's apps: the other apps that SPUN on the Next installs, or updates to their latest release, before it installs or updates this app. The list replaces the one the app has.",
    `Input: id, the app id, and depends, a list of app ids of apps on SPUN that are not deleted, any user's, up to ${DEPENDS_MAX}. Not aliases, and not the app itself. Capitals do not matter, and an id given twice counts once. An empty or missing list removes every dependency.`,
    "Each release keeps the dependencies the app has when the release is made, and they never change after that. A change here reaches the Next only with the app's next release; republish_app makes one without a new zip.",
    "Returns {}.",
    `Errors: depends.unknown (names lists the ids that are not apps on SPUN, or are deleted), depends.self, depends.tooMany (max gives the limit), and app.notFound.`,
  ].join("\n\n"),
  republishApp: [
    "Makes a new release of one of the user's apps from the zip of its latest release that is not deleted, with the app's current dependencies. The release date is today. Use it after set_depends, to send new dependencies to the Next without a new zip.",
    "Input: id, the app id, version, the new release's version, and changelog.",
    VERSION_RULES,
    CHANGELOG_RULES,
    "The zip is checked again as an upload is, so a zip that the rules now refuse is refused here too, with the file error code. It counts towards the user's upload limit for each hour, which releases and screenshots share across the SPUN site, the API and these tools.",
    'Returns { "serial": 2, "dotMoves": [] }: the new release serial, and each dot command that SPUN on the Next moves to C:/dot/ after install, as { file, to }. Tell the user about each move.',
    "Errors: version.length, version.invalidCharacters, version.taken, changelog.length, changelog.invalidCharacters, a file error code when the zip no longer passes the checks, app.releasesFull, upload.tooMany (max gives the limit and wait the seconds until uploads work again; tell the user, and do not try again before then), release.notFound (the app has no release that is not deleted) and app.notFound.",
  ].join("\n\n"),
  setChangelog: [
    "Changes the changelog of one release of one of the user's apps. An empty or missing changelog removes it.",
    "Input: id, the app id, serial, the release serial from get_app, and changelog.",
    CHANGELOG_RULES,
    "Returns {}.",
    "Errors: changelog.length, changelog.invalidCharacters, app.notFound, and release.notFound when the release does not exist or is deleted.",
  ].join("\n\n"),
  deleteRelease: [
    "Deletes one release of one of the user's apps and takes its zip off the SPUN download server. It cannot be undone: its serial and version are never used again. When no release is left that is not deleted, the app is no longer public. Ask the user before you delete a release.",
    "Input: id, the app id, and serial, the release serial from get_app.",
    "Returns {}.",
    "Errors: app.notFound, and release.notFound when the release does not exist or is already deleted.",
  ].join("\n\n"),
  deleteScreenshot: [
    `Clears one screenshot slot of one of the user's apps and deletes its files. Slots are 1 to ${SCREENSHOT_SLOTS}; slot 1 is the main screenshot. get_app lists the slots that have a screenshot.`,
    "Input: id, the app id, and slot.",
    "To put a new screenshot in a slot, use upload_screenshot: an upload replaces the screenshot that is in the slot, so there is no need to clear it first.",
    "Returns {}.",
    `Errors: app.notFound, and screenshot.notFound when the slot is empty or outside 1 to ${SCREENSHOT_SLOTS}.`,
  ].join("\n\n"),
  saveApp: [
    "Saves a public app to the user's saved apps, the user's own app or another user's. Saving an app that is already saved changes nothing. list_saved lists them.",
    "Input: id, the app id.",
    "Returns {}.",
    "Error app.notFound: no such app, or it is not public.",
  ].join("\n\n"),
  unsaveApp: [
    "Removes an app from the user's saved apps. It also succeeds when the app was not saved.",
    "Input: id, the app id.",
    "Returns {}.",
  ].join("\n\n"),
  uploadRelease: [
    "Gives a one-time URL to upload a zip as a new release of one of the user's apps. This tool takes the release's version, release date and changelog, but not the file: send the zip to the URL as a multipart/form-data POST with one field, file, for example with the curl command it returns. The release gets the version, release date and changelog given here.",
    ...UPLOAD_URL_RULES,
    "Input: id, the app id, version, the new release's version, releaseDate and changelog.",
    UPLOAD_RETURNS("release"),
    VERSION_RULES,
    RELEASE_DATE_RULES,
    CHANGELOG_RULES,
    `The zip: up to ${MAX_UPLOAD_TEXT}, and the Next must be able to unzip it (file.incompatible). Its files may add up to at most ${MAX_UNPACKED_TEXT} unpacked (file.unpackedTooLarge). Each name in it must be printable ASCII (space to }) without any of " * < > ? | ~, and no part of a name may end with a dot or a space (file.badNames). No entry may carry a second, Unicode name that differs from its own (file.twoNames). No macOS files: nothing in __MACOSX, no .DS_Store, no file whose name starts with ._ (file.macFiles). The files must be at the root of the zip, not all in one directory (file.oneDirectory). For these errors, names lists what to fix.`,
    "A file at the root of the zip whose name ends .dot, in any case, is a dot command. After SPUN on the Next installs or updates the app, it moves each one to C:/dot/ without the extension: wifi.dot goes to C:/dot/wifi. The names of the dot commands the Next already has, and spun, are reserved (file.dotCommandTaken), and such a name may not end with a dot or a space (file.dotNameEnd).",
    'The URL answers as the API does: 201 and { "serial": 1, "dotMoves": [{ "file": "wifi.dot", "to": "C:/dot/wifi" }] }, the new release serial and each dot command that SPUN on the Next moves to C:/dot/ after install. Tell the user about each move. An error is a status from 400 up and { "error": { "code": ... } }: version.taken, file.missing, file.tooLarge, file.notZip and the file errors above, app.releasesFull, upload.tooMany (429; wait gives the seconds until uploads work again: tell the user, and do not try again before then), app.notFound, and upload.badTicket (404: the URL is unknown, used or expired, the user can no longer publish, or the user disconnected this client).',
    "Errors of this tool: app.notFound (no such app, it is deleted, or it is another user's), version.length, version.invalidCharacters, releaseDate.invalid, releaseDate.future, changelog.length and changelog.invalidCharacters.",
  ].join("\n\n"),
  uploadScreenshot: [
    `Gives a one-time URL to upload a screenshot into one slot of one of the user's apps. Slots are 1 to ${SCREENSHOT_SLOTS}; slot 1 is the main screenshot. An upload replaces the screenshot that is in the slot. This tool does not take the file: send it to the URL as a multipart/form-data POST with one field, file, for example with the curl command it returns.`,
    ...UPLOAD_URL_RULES,
    "Input: id, the app id, and slot.",
    UPLOAD_RETURNS("screenshot"),
    `The file: a PNG, JPEG, GIF or WebP image of up to ${MAX_IMAGE_PIXELS_TEXT} (width times height), which SPUN converts to the Next's NXI format, 256x192 or 320x256; or a ready NXI file, with a name that ends .nxi: 49,664 bytes (256x192) or 82,432 bytes (320x256), with its palette first. Up to ${MAX_SCREENSHOT_TEXT}.`,
    'The URL answers as the API does: 200 and { "slot": 1, "width": 256 }, where width is the width of the NXI. An error is a status from 400 up and { "error": { "code": ... } }: screenshot.missing, screenshot.tooLarge, screenshot.notImage, screenshot.tooManyPixels, screenshot.badNxi, upload.tooMany (429; wait gives the seconds until uploads work again: tell the user, and do not try again before then), app.notFound, and upload.badTicket (404: the URL is unknown, used or expired, the user can no longer publish, or the user disconnected this client).',
    `Errors of this tool: app.notFound (no such app, it is deleted, or it is another user's), and screenshot.notFound for a slot outside 1 to ${SCREENSHOT_SLOTS}.`,
  ].join("\n\n"),
};
