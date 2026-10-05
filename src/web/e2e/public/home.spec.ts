import type { Page } from "@playwright/test";
import { appRow, featureRows, insertAlias, publishedFeatureIds, screenshotRows, setFeaturesPublished } from "../support/db";
import { expect, test } from "../support/publisher";
import { settings } from "../support/settings";

// The setup's feature of the test app is the live one, and the test app has
// no screenshots.

const id = settings.testApp;

async function naturalWidth(page: Page, testId: string): Promise<number> {
  const image = page.getByTestId(testId);
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete)).toBe(true);
  return image.evaluate((element: HTMLImageElement) => element.naturalWidth);
}

async function getMarkdown(page: Page, url: string): Promise<string> {
  const response = await page.request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toBe("text/markdown; charset=utf-8");
  return response.text();
}

test("the hero on / shows the live feature, with the placeholder or the main screenshot", async ({
  page,
  publisher,
}) => {
  const [feature] = await featureRows(id);
  expect((await screenshotRows(id)).map((row) => row.slot)).not.toContain(1);

  await page.goto("/");
  const hero = page.getByTestId("hero");
  await expect(hero.getByTestId("hero-title")).toHaveText((await appRow(id)).title);
  expect(await hero.getByTestId("hero-article").innerHTML()).toBe(feature.article_html);
  expect(await naturalWidth(page, "hero-placeholder")).toBe(320);
  await expect(hero.getByTestId("hero-placeholder")).toHaveAttribute("src", "/placeholder.png");
  await expect(hero.getByTestId("hero-screenshot")).toHaveCount(0);
  await expect(hero.getByTestId("hero-link")).toHaveAttribute("href", "/catalogue/featured");
  await hero.getByTestId("hero-link").click();
  await expect(page).toHaveURL((url) => url.pathname === `/catalogue/${id}`);

  await publisher.uploadScreenshot(id, 1);
  try {
    await page.goto("/");
    expect(await naturalWidth(page, "hero-screenshot")).toBe(320);
    expect(new URL((await page.getByTestId("hero-screenshot").getAttribute("src"))!, "http://x").pathname).toBe(
      `/catalogue/${id}/screenshots/1`,
    );
    await expect(page.getByTestId("hero-placeholder")).toHaveCount(0);
  } finally {
    await publisher.clearScreenshot(id, 1);
  }
  await page.goto("/");
  await expect(page.getByTestId("hero-placeholder")).toBeVisible();
});

test("/ and /index.md have no hero when no feature is live", async ({ page }) => {
  const published = await publishedFeatureIds();
  expect(published).toContain((await featureRows(id))[0].id);
  await setFeaturesPublished(published, false);
  try {
    await page.goto("/");
    await expect(page.getByTestId("home-catalogue")).toBeVisible();
    await expect(page.getByTestId("hero")).toHaveCount(0);
    const text = await getMarkdown(page, "/index.md");
    expect(text).not.toContain("## Featured");
    expect(text).toContain("[Browse the catalogue](/catalogue.md)");
  } finally {
    await setFeaturesPublished(published, true);
  }
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
});

test("/index.md has the feature's article, the install text while spun resolves, and links that work", async ({
  page,
  publisher,
}) => {
  const [feature] = await featureRows(id);
  const title = (await appRow(id)).title;
  const links = (text: string) => [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);

  const text = await getMarkdown(page, "/index.md");
  const lines = text.split("\n");
  expect(lines[0]).toBe("# SPUN");
  expect(lines).toContain(`## Featured: ${title}`);
  expect(text).toContain(`\n${feature.article}\n`);
  expect(lines).toContain(`[${title}](/catalogue/${id}.md)`);
  expect(lines).toContain("[Browse the catalogue](/catalogue.md)");
  expect(lines).not.toContain("## Install SPUN");
  expect(links(text).sort()).toEqual([`/catalogue/${id}.md`, "/catalogue.md"].sort());
  for (const link of links(text)) {
    expect((await page.request.get(link)).status(), link).toBe(200);
  }

  const spun = await publisher.create("Spun");
  await publisher.upload(spun, "1.0", 1);
  await insertAlias("spun", spun);
  const withInstall = await getMarkdown(page, "/index.md");
  expect(withInstall.split("\n")).toContain("## Install SPUN");
  expect(withInstall).toContain("On the Next, you can also run `.nbnget /dot/spun : ../spun get spun`.");
  expect(links(withInstall)).toContain(`/catalogue/${spun}/download`);
  for (const link of links(withInstall)) {
    expect((await page.request.get(link)).status(), link).toBe(200);
  }
});
