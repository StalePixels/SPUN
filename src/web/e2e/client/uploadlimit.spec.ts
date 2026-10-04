import type { Page } from "@playwright/test";
import { makeApiKey, signedFetch, type ApiKey } from "../support/api";
import { releaseRow, screenshotRows, userByUsername } from "../support/db";
import { readyNxi } from "../support/images";
import { clickHydrated, expect, test, uploadRelease, waitForHydration } from "../support/pages";
import { clearUploadCount, setUploadCount, uploadsPerHour } from "../support/redis";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;

async function apiRelease(page: Page, key: ApiKey, appId: string, version: string) {
  const response = await signedFetch(page.request, key, `/api/apps/${appId}/releases`, {
    method: "POST",
    multipart: { version, file: { name: "game.zip", mimeType: "application/zip", buffer: makeZip(sampleEntries()) } },
  });
  return { status: response.status(), retryAfter: response.headers()["retry-after"], body: await response.json() };
}

async function apiScreenshot(page: Page, key: ApiKey, appId: string, slot: number) {
  const response = await signedFetch(page.request, key, `/api/apps/${appId}/screenshots/${slot}`, {
    method: "PUT",
    multipart: { file: { name: "shot.nxi", mimeType: "application/octet-stream", buffer: readyNxi() } },
  });
  return { status: response.status(), body: await response.json() };
}

test("one upload limit for each user: the web forms and every key count together, and each refusal is upload.tooMany", async ({
  page,
  apps,
}) => {
  const files = tempFiles();
  const user = await userByUsername(client.username);
  const keyA = await makeApiKey(page);
  const keyB = await makeApiKey(page);
  const id = await apps.create("Upload limit");
  const tooMany = { error: { code: "upload.tooMany", max: uploadsPerHour, wait: expect.any(Number) } };
  try {
    await setUploadCount(user.id, uploadsPerHour - 3);

    await page.goto(`/publish/apps/${id}`);
    await uploadRelease(page, { version: "1.0", file: files.write("one.zip", makeZip(sampleEntries())) });
    await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
    expect((await apiRelease(page, keyA, id, "2.0")).status).toBe(201);
    expect((await apiScreenshot(page, keyB, id, 1)).status).toBe(200);

    const refused = await apiRelease(page, keyA, id, "3.0");
    expect(refused).toMatchObject({ status: 429, body: tooMany });
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    expect(await apiScreenshot(page, keyB, id, 2)).toEqual({ status: 429, body: tooMany });

    await page.goto(`/publish/apps/${id}`);
    await uploadRelease(page, { version: "4.0", file: files.write("four.zip", makeZip(sampleEntries())) });
    await expect(page.getByTestId("form-error").first()).toHaveAttribute("data-error", "upload.tooMany");
    await waitForHydration(page.getByTestId("screenshot-upload-3"));
    await page.getByTestId("screenshot-file-3").setInputFiles(files.write("shot.nxi", readyNxi()));
    await clickHydrated(page.getByTestId("screenshot-upload-3"));
    await expect(page.getByTestId("screenshot-slot-3").getByTestId("form-error")).toHaveAttribute(
      "data-error",
      "upload.tooMany",
    );

    expect(await releaseRow(id, 3)).toBeUndefined();
    expect((await screenshotRows(id)).map((row) => row.slot)).toEqual([1]);
  } finally {
    await clearUploadCount(user.id);
    files.remove();
  }
});
