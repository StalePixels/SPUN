import "server-only";
import { appView, catalogueView, type AppView, type CatalogueView } from "./catalogue";
import { liveCategories, type Category } from "./categories";
import {
  API_IP_PER_MINUTE,
  API_JSON_BODY_MAX,
  API_KEY_PER_MINUTE,
  API_RELEASE_BODY_MAX,
  API_REQUEST_WINDOW_SECONDS,
  API_SCREENSHOT_BODY_MAX,
  API_UPLOADS_PER_HOUR,
  catalogueHref,
  formatDay,
  parsePage,
  parseQuery,
  releaseFileName,
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
  return categories.map((category) => link(category.name, `/${category.slug}.md`)).join(", ");
}

function catalogueMarkdown(view: CatalogueView, page: number, query: string): string {
  const base = view.category ? `/${view.category.slug}.md` : "/index.md";
  const lines = [`# ${escapeText(view.category?.name ?? "Apps")}`, ""];
  if (query !== "") {
    lines.push(`Search: ${escapeText(query)}`, "");
  }
  if (view.categories.length > 0) {
    lines.push("## Categories", "");
    lines.push(...view.categories.map((category) => `- ${link(category.name, `/${category.slug}.md`)}`), "");
  }
  lines.push("## Apps", "");
  if (view.rows.length === 0) {
    lines.push("No apps to show.", "");
  }
  for (const row of view.rows) {
    const publisher = row.username ? ` by ${escapeText(row.username)}` : "";
    const categories = row.categories.length > 0 ? `. Categories: ${categoryLinks(row.categories)}` : "";
    lines.push(
      `- ${link(row.title, `/apps/${row.id}.md`)}${publisher}: version ${escapeText(row.version)}, ${formatDay(row.releaseDate)}, ${row.downloads} downloads${categories}`,
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
    `- Download: ${link(releaseFileName(app.id, latest.serial), `/apps/${app.id}/download`)}`,
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
    `- ${link("All apps", "/index.md")}: every public app by title, with its publisher, latest version, release date, download total and categories. 20 apps to a page; \`?page=N\` gives page N.`,
    "",
    "## Categories",
    "",
    ...categories.map((category) => `- ${link(category.name, `/${category.slug}.md`)}: the catalogue with only this category.`),
    "",
    "## Search",
    "",
    "- `/index.md?q={text}`: the apps whose title or description contains the text, in any case. `/{category}.md?q={text}` searches in one category. `?page=N` works here too.",
    "",
    "## App pages",
    "",
    "- `/apps/{id}.md`: one app, with its publisher, description, categories, download total and every live release with its changelog. The catalogue links each app.",
    "",
    "## Downloads",
    "",
    "- `/apps/{id}/download`: the zip of the app's latest release. Older releases have no web download.",
    "",
    "## API",
    "",
    `- ${link("SPUN API", "/api.md")}: how an agent with a user's API key works with that user's apps. Each request is signed with the key.`,
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
    "A user makes a key on `/keys`. The way there is `/me`, the account page that the user name in the navbar links to. A user needs a username before they can make a key. The CMS shows the key once, when it is made, and never again. The user can delete a key on the same page; a deleted key stops working at once.",
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
    "KEY=nbnspun-...   # the key from /keys",
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
    "- `404`: not found.",
    "- `411`, `api.lengthRequired`: a `POST` or `PUT` request, or a request with a chunked body, has no `Content-Length` header.",
    "- `413`, `api.bodyTooLarge`: the body is larger than the call permits. `max` is the limit in bytes.",
    "- `429`, `api.tooManyRequests`: a rate limit was reached. The `Retry-After` header gives the seconds to wait.",
    "",
    "## Limits",
    "",
    `- Body size: ${API_JSON_BODY_MAX} bytes for a JSON call, ${API_RELEASE_BODY_MAX} bytes for a release upload, ${API_SCREENSHOT_BODY_MAX} bytes for a screenshot upload.`,
    `- ${API_IP_PER_MINUTE} requests a minute from one IP address, signed or not.`,
    `- ${API_KEY_PER_MINUTE} requests a minute with one key.`,
    `- ${API_UPLOADS_PER_HOUR} uploads an hour with one key, releases and screenshots together.`,
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

export function apiResponse(): Response {
  return markdownResponse(apiText());
}

export async function llmsResponse(): Promise<Response> {
  return new Response(llmsText(await liveCategories()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
