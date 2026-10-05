import type { Page } from "@playwright/test";
import { listedAppIds } from "../support/categories";
import { liveCategorySlugs } from "../support/db";
import { expect, test } from "../support/searchData";

async function getMarkdown(page: Page, url: string): Promise<string> {
  const response = await page.request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toBe("text/markdown; charset=utf-8");
  return response.text();
}

// Every app id that a Markdown catalogue lists, over all its pages.
async function markdownAppIds(page: Page, url: string): Promise<string[]> {
  const ids: string[] = [];
  for (let next: string | undefined = url; next; ) {
    const text = await getMarkdown(page, next);
    ids.push(...[...text.matchAll(/\]\(\/catalogue\/([0-9a-z]{6})\.md\)/g)].map((match) => match[1]));
    next = text.match(/\[Next page\]\(([^)]+)\)/)?.[1];
  }
  return ids;
}

async function alternateHref(page: Page): Promise<string | null> {
  return page.locator('head link[rel="alternate"][type="text/markdown"]').getAttribute("href");
}

test("each catalogue page has a Markdown copy at its URL plus .md, with the same apps", async ({ page, data }) => {
  await page.goto("/catalogue");
  const slugs = await page
    .getByTestId(/^category-link-/)
    .evaluateAll((links) => links.map((link) => (link.getAttribute("data-testid") ?? "").replace("category-link-", "")));
  expect(slugs).toContain(data.one.slug);

  const pages: [string, string][] = [
    ["/catalogue", "/catalogue.md"],
    [`/catalogue?q=${data.titleWord}`, `/catalogue.md?q=${data.titleWord}`],
    [`/catalogue/${data.one.slug}?q=${data.titleWord}`, `/catalogue/${data.one.slug}.md?q=${data.titleWord}`],
    ...slugs.map((slug): [string, string] => [`/catalogue/${slug}`, `/catalogue/${slug}.md`]),
  ];
  for (const [html, markdown] of pages) {
    await page.goto(html);
    expect(await alternateHref(page), html).toBe(markdown);
    const htmlIds = await listedAppIds(page, html);
    expect(await markdownAppIds(page, markdown), markdown).toEqual(htmlIds);
  }
  expect(await markdownAppIds(page, `/catalogue.md?q=${data.titleWord}`)).toEqual([data.inOne.id, data.inTwo.id]);
});

test("the app page has a Markdown copy with the same details", async ({ page, data }) => {
  const id = data.inOne.id;
  await page.goto(`/catalogue/${id}`);
  expect(await alternateHref(page)).toBe(`/catalogue/${id}.md`);
  await expect(page.getByTestId("public-app-title")).toHaveText(data.inOne.title);
  await expect(page.getByTestId("public-app-version")).toHaveText("1.1");
  const serials = await page
    .getByTestId(/^public-release-\d+$/)
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
  expect(serials).toEqual(["public-release-2", "public-release-1"]);

  const text = await getMarkdown(page, `/catalogue/${id}.md`);
  const lines = text.split("\n");
  expect(lines[0]).toBe(`# ${data.inOne.title}`);
  expect(lines).toContain(`Publisher: ${data.owner.username}`);
  expect(lines).toContain(`Categories: [${data.one.name}](/catalogue/${data.one.slug}.md)`);
  expect(lines).toContain(`Has ${data.descriptionWord} in it`);
  expect(lines).toContain("- Latest version: 1.1");
  expect(lines).toContain(`- Download: [${id}-0002.zip](/catalogue/${id}/download)`);
  const versions = lines.filter((line) => line.startsWith("### Version ")).map((line) => line.split(/[ ,]/)[2]);
  expect(versions).toEqual(["1.1", "1.0"]);
});

test("an unknown or deleted app or category gives 404 for the page and for its Markdown copy", async ({
  page,
  data,
}) => {
  for (const path of [`/catalogue/${data.deleted.id}`, `/catalogue/${data.gone.slug}`, `/catalogue/${data.gone.slug}-x`]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    expect((await page.request.get(`${path}.md`)).status(), `${path}.md`).toBe(404);
  }
});

test("/llms.txt links every live category and not a deleted one, and every link works", async ({ page, data }) => {
  const response = await page.request.get("/llms.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text.startsWith("# SPUN\n")).toBe(true);

  const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  expect(links).toContain("/catalogue.md");
  const categorySlugs = links
    .map((link) => link.match(/^\/catalogue\/([a-z0-9-]+)\.md$/)?.[1])
    .filter((slug): slug is string => slug !== undefined);
  expect([...categorySlugs].sort()).toEqual((await liveCategorySlugs()).sort());
  expect(categorySlugs).toContain(data.one.slug);
  expect(categorySlugs).not.toContain(data.gone.slug);

  for (const link of links.filter((link) => link.startsWith("/"))) {
    expect((await page.request.get(link)).status(), link).toBe(200);
  }
});

test("the old Markdown URLs redirect permanently to the catalogue, with their query", async ({ page, data }) => {
  const moved: [string, string][] = [
    [`/index.md?q=${data.titleWord}`, `/catalogue.md?q=${data.titleWord}`],
    [`/${data.one.slug}.md?page=2`, `/catalogue/${data.one.slug}.md?page=2`],
    [`/apps/${data.inOne.id}.md`, `/catalogue/${data.inOne.id}.md`],
  ];
  for (const [old, now] of moved) {
    const response = await page.request.get(old, { maxRedirects: 0 });
    expect(response.status(), old).toBe(308);
    expect(response.headers()["location"], old).toBe(now);
  }
  expect((await page.request.get(`/${data.gone.slug}.md`, { maxRedirects: 0 })).status()).toBe(404);
});
