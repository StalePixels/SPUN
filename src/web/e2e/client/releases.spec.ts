import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { releaseRow } from "../support/db";
import { binFile, clickHydrated, expect, releaseFile, test, uploadRelease, waitForHydration } from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

let files: ReturnType<typeof tempFiles>;
test.beforeEach(() => {
  files = tempFiles();
});
test.afterEach(() => {
  files.remove();
});

async function upload(page: Page, appId: string, version: string, serial: number) {
  await page.goto(`/publish/apps/${appId}`);
  await uploadRelease(page, { version, file: files.write(`${version}.zip`, makeZip(sampleEntries())) });
  await expect(page).toHaveURL(new RegExp(`/publish/apps/${appId}/releases/${serial}$`));
}

test("the release list is latest first, and an app id in capitals works", async ({ page, apps }) => {
  const id = await apps.create("Order");
  await upload(page, id, "1.0", 1);
  await upload(page, id, "1.1", 2);
  await upload(page, id, "2.0", 3);

  await page.goto(`/publish/apps/${id}`);
  const order = await page.getByTestId(/^release-\d+$/).evaluateAll((links) =>
    links.map((link) => link.getAttribute("data-testid")),
  );
  expect(order).toEqual(["release-3", "release-2", "release-1"]);

  const response = await page.goto(`/publish/apps/${id.toUpperCase()}/releases/2`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("release-version")).toHaveText("1.1");
});

test("delete a release: file goes to the bin, row stays, serial is not used again", async ({ page, apps }) => {
  const id = await apps.create("DelRelease");
  await upload(page, id, "1.0", 1);
  await upload(page, id, "1.1", 2);
  const file = releaseFile(client.username, id, 2);
  expect(existsSync(file)).toBe(true);

  // Delete the newest release, so a reused serial would show on the next upload.
  await expect(page.getByTestId("release-deleted")).toHaveCount(0);
  await clickHydrated(page.getByTestId("delete-release"));
  await page.getByTestId("delete-release-confirm").click();

  await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/2$`));
  await expect(page.getByTestId("release-deleted")).toBeVisible();
  await expect(page.getByTestId("delete-release")).toHaveCount(0);

  await page.goto(`/publish/apps/${id}`);
  // Greyed out in the list; the other release is not.
  await expect(page.getByTestId("release-2")).toHaveClass(/text-body-secondary/);
  await expect(page.getByTestId("release-1")).not.toHaveClass(/text-body-secondary/);

  expect(existsSync(file)).toBe(false);
  expect(existsSync(binFile(id, 2))).toBe(true);
  const row = await releaseRow(id, 2);
  expect(row?.version).toBe("1.1");
  expect(row?.deleted_at).not.toBeNull();

  await upload(page, id, "1.2", 3);
  expect((await releaseRow(id, 3))?.version).toBe("1.2");
  expect((await releaseRow(id, 2))?.deleted_at).not.toBeNull();
});

test("an upload stores its changelog, and the public app page shows it with its line breaks", async ({ page, apps }) => {
  const id = await apps.create("Changelog");
  await page.goto(`/publish/apps/${id}`);
  await uploadRelease(page, {
    version: "1.0",
    changelog: "Fixed the border.\nAdded sound.",
    file: files.write("1.0.zip", makeZip(sampleEntries())),
  });
  await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  // The browser sends CR LF from the textarea; the row holds LF only.
  expect((await releaseRow(id, 1))?.changelog).toBe("Fixed the border.\nAdded sound.");

  await page.goto(`/apps/${id}`);
  const changelog = page.getByTestId("public-changelog-1");
  await expect(changelog).toBeVisible();
  // innerText keeps a line break only where the page shows one.
  expect(await changelog.innerText()).toBe("Fixed the border.\nAdded sound.");
});

test("a changelog with a tab shows changelog.invalidCharacters and stores nothing", async ({ page, apps }) => {
  const id = await apps.create("BadChangelog");
  await page.goto(`/publish/apps/${id}`);
  await uploadRelease(page, {
    version: "1.0",
    changelog: "one\ttwo",
    file: files.write("1.0.zip", makeZip(sampleEntries())),
  });
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "changelog.invalidCharacters");
  expect(await releaseRow(id, 1)).toBeUndefined();
  expect(existsSync(releaseFile(client.username, id, 1))).toBe(false);
});

test("the owner edits the changelog on the release page", async ({ page, apps }) => {
  const id = await apps.create("EditChangelog");
  await upload(page, id, "1.0", 1);
  expect((await releaseRow(id, 1))?.changelog).toBeNull();

  await waitForHydration(page.getByTestId("changelog-edit"));
  await page.getByTestId("changelog-edit").fill("First line.\nSecond line.");
  await clickHydrated(page.getByTestId("changelog-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect((await releaseRow(id, 1))?.changelog).toBe("First line.\nSecond line.");

  await page.getByTestId("changelog-edit").fill("");
  await page.getByTestId("changelog-submit").click();
  await expect.poll(async () => (await releaseRow(id, 1))?.changelog).toBeNull();
});
