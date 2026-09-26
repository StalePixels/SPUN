import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { releaseRow } from "../support/db";
import { expect, releaseFile, test, uploadRelease } from "../support/pages";
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
  await page.goto(`/apps/${appId}`);
  await uploadRelease(page, { version, file: files.write(`${version}.zip`, makeZip(sampleEntries())) });
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/releases/${serial}$`));
}

test("the release list is latest first, and an app id in capitals works", async ({ page, apps }) => {
  const id = await apps.create("Order");
  await upload(page, id, "1.0", 1);
  await upload(page, id, "1.1", 2);
  await upload(page, id, "2.0", 3);

  await page.goto(`/apps/${id}`);
  const order = await page.getByTestId(/^release-\d+$/).evaluateAll((links) =>
    links.map((link) => link.getAttribute("data-testid")),
  );
  expect(order).toEqual(["release-3", "release-2", "release-1"]);

  const response = await page.goto(`/apps/${id.toUpperCase()}/releases/2`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("release-version")).toHaveText("1.1");
});

test("delete a release: file goes, row stays, serial is not used again", async ({ page, apps }) => {
  const id = await apps.create("DelRelease");
  await upload(page, id, "1.0", 1);
  await upload(page, id, "1.1", 2);
  const file = releaseFile(client.username, id, 2);
  expect(existsSync(file)).toBe(true);

  // Delete the newest release, so a reused serial would show on the next upload.
  await expect(page.getByTestId("release-deleted")).toHaveCount(0);
  await page.getByTestId("delete-release").click();
  await page.getByTestId("delete-release-confirm").click();

  await expect(page).toHaveURL(new RegExp(`/apps/${id}/releases/2$`));
  await expect(page.getByTestId("release-deleted")).toBeVisible();
  await expect(page.getByTestId("delete-release")).toHaveCount(0);

  await page.goto(`/apps/${id}`);
  // Greyed out in the list; the other release is not.
  await expect(page.getByTestId("release-2")).toHaveClass(/text-body-secondary/);
  await expect(page.getByTestId("release-1")).not.toHaveClass(/text-body-secondary/);

  expect(existsSync(file)).toBe(false);
  const row = await releaseRow(id, 2);
  expect(row?.version).toBe("1.1");
  expect(row?.deleted_at).not.toBeNull();

  await upload(page, id, "1.2", 3);
  expect((await releaseRow(id, 3))?.version).toBe("1.2");
  expect((await releaseRow(id, 2))?.deleted_at).not.toBeNull();
});
