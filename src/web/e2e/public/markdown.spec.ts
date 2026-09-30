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
    ids.push(...[...text.matchAll(/\]\(\/apps\/([0-9a-z]{6})\.md\)/g)].map((match) => match[1]));
    next = text.match(/\[Next page\]\(([^)]+)\)/)?.[1];
  }
  return ids;
}

async function alternateHref(page: Page): Promise<string | null> {
  return page.locator('head link[rel="alternate"][type="text/markdown"]').getAttribute("href");
}

test("each catalogue page has a Markdown copy at its URL plus .md, with the same apps", async ({ page, data }) => {
  await page.goto("/");
  const slugs = await page
    .getByTestId(/^category-link-/)
    .evaluateAll((links) => links.map((link) => (link.getAttribute("data-testid") ?? "").replace("category-link-", "")));
  expect(slugs).toContain(data.one.slug);

  const pages: [string, string][] = [
    ["/", "/index.md"],
    [`/?q=${data.titleWord}`, `/index.md?q=${data.titleWord}`],
    [`/${data.one.slug}?q=${data.titleWord}`, `/${data.one.slug}.md?q=${data.titleWord}`],
    ...slugs.map((slug): [string, string] => [`/${slug}`, `/${slug}.md`]),
  ];
  for (const [html, markdown] of pages) {
    await page.goto(html);
    expect(await alternateHref(page), html).toBe(markdown);
    const htmlIds = await listedAppIds(page, html);
    expect(await markdownAppIds(page, markdown), markdown).toEqual(htmlIds);
  }
  expect(await markdownAppIds(page, `/index.md?q=${data.titleWord}`)).toEqual([data.inOne.id, data.inTwo.id]);
});

test("the app page has a Markdown copy with the same details", async ({ page, data }) => {
  const id = data.inOne.id;
  await page.goto(`/apps/${id}`);
  expect(await alternateHref(page)).toBe(`/apps/${id}.md`);
  await expect(page.getByTestId("public-app-title")).toHaveText(data.inOne.title);
  await expect(page.getByTestId("public-app-version")).toHaveText("1.1");
  const serials = await page
    .getByTestId(/^public-release-\d+$/)
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
  expect(serials).toEqual(["public-release-2", "public-release-1"]);

  const text = await getMarkdown(page, `/apps/${id}.md`);
  const lines = text.split("\n");
  expect(lines[0]).toBe(`# ${data.inOne.title}`);
  expect(lines).toContain(`Publisher: ${data.owner.username}`);
  expect(lines).toContain(`Categories: [${data.one.name}](/${data.one.slug}.md)`);
  expect(lines).toContain(`Has ${data.descriptionWord} in it`);
  expect(lines).toContain("- Latest version: 1.1");
  expect(lines).toContain(`- Download: [${id}-0002.zip](/apps/${id}/download)`);
  const versions = lines.filter((line) => line.startsWith("### Version ")).map((line) => line.split(/[ ,]/)[2]);
  expect(versions).toEqual(["1.1", "1.0"]);
});

test("an unknown or deleted app or category gives 404 for the page and for its Markdown copy", async ({
  page,
  data,
}) => {
  for (const path of [`/apps/${data.deleted.id}`, `/${data.gone.slug}`, `/${data.gone.slug}-x`]) {
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
  expect(links).toContain("/index.md");
  const categorySlugs = links
    .map((link) => link.match(/^\/([a-z0-9-]+)\.md$/)?.[1])
    .filter((slug): slug is string => slug !== undefined && slug !== "index");
  expect([...categorySlugs].sort()).toEqual((await liveCategorySlugs()).sort());
  expect(categorySlugs).toContain(data.one.slug);
  expect(categorySlugs).not.toContain(data.gone.slug);

  for (const link of links) {
    expect((await page.request.get(link)).status(), link).toBe(200);
  }
});
