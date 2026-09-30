import "server-only";
import { appView, catalogueView, type AppView, type CatalogueView } from "./catalogue";
import { liveCategories, type Category } from "./categories";
import { catalogueHref, formatDay, parsePage, parseQuery, releaseFileName } from "./rules";

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

export async function llmsResponse(): Promise<Response> {
  return new Response(llmsText(await liveCategories()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
