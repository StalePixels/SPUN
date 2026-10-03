import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { releaseRow } from "../support/db";
import {
  expect,
  fileSize,
  fillUpload,
  forceUploadSubmit,
  formatDay,
  releaseFile,
  skipBrowserChecks,
  test,
  waitForHydration,
  todayUtc,
  uploadRelease,
} from "../support/pages";
import { accounts } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

const client = accounts.client;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

let files: ReturnType<typeof tempFiles>;
test.beforeEach(() => {
  files = tempFiles();
});
test.afterEach(() => {
  files.remove();
});

function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// The server answered with this error code, the page stays, and no release exists.
async function expectRefused(page: Page, appId: string, code: string) {
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", code);
  await expect(page).toHaveURL(new RegExp(`/publish/apps/${appId}$`));
  expect(await releaseRow(appId, 1)).toBeUndefined();
}

// The browser stopped the form: no alert, no release.
async function expectBlockedByBrowser(page: Page, appId: string, field: string, check: "patternMismatch" | "valueMissing") {
  const invalid = await page.getByTestId(field).evaluate(
    (input: HTMLInputElement, key) => input.validity[key],
    check,
  );
  expect(invalid).toBe(true);
  await expect(page.getByTestId("form-error")).toHaveCount(0);
  expect(await releaseRow(appId, 1)).toBeUndefined();
}

test("a valid zip becomes Release 1, on disk and in the database", async ({ page, apps }) => {
  const id = await apps.create("Upload");
  const zip = makeZip(sampleEntries());
  await uploadRelease(page, { version: "1.0-beta", file: files.write("game.zip", zip) });

  await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  await expect(page.getByTestId("release-version")).toHaveText("1.0-beta");
  await expect(page.getByTestId("release-date")).toHaveText(formatDay(todayUtc()));
  await expect(page.getByTestId("release-file")).toHaveText(`/${client.username}/${id}-0001.zip`);
  await expect(page.getByTestId("zip-entry")).toHaveText(sampleEntries().map((entry) => entry.name));

  expect(fileSize(releaseFile(client.username, id, 1))).toBe(zip.length);
  expect(await releaseRow(id, 1)).toMatchObject({ version: "1.0-beta", release_date: todayUtc(), deleted_at: null });
});

test("a historic release keeps its past date; the date is off until ticked", async ({ page, apps }) => {
  const id = await apps.create("Historic");
  const date = page.getByTestId("upload-date");
  await expect(date).toBeDisabled();
  await waitForHydration(page.getByTestId("upload-historic"));
  await page.getByTestId("upload-historic").check();
  await expect(date).toBeEnabled();
  await page.getByTestId("upload-historic").uncheck();
  await expect(date).toBeDisabled();

  await uploadRelease(page, {
    version: "0.9",
    historicDate: "2020-05-17",
    file: files.write("old.zip", makeZip(sampleEntries())),
  });
  await expect(page).toHaveURL(new RegExp(`/publish/apps/${id}/releases/1$`));
  await expect(page.getByTestId("release-date")).toHaveText(formatDay("2020-05-17"));
  expect((await releaseRow(id, 1))?.release_date).toBe("2020-05-17");
});

test("a version with a space: the browser blocks it, and so does the server", async ({ page, apps }) => {
  const id = await apps.create("Version");
  await fillUpload(page, { version: "1 0", file: files.write("game.zip", makeZip(sampleEntries())) });
  await page.getByTestId("upload-submit").click();
  await expectBlockedByBrowser(page, id, "upload-version", "patternMismatch");

  await skipBrowserChecks(page);
  await page.getByTestId("upload-submit").click();
  await expectRefused(page, id, "version.invalidCharacters");
});

test("no file chosen: the browser blocks it, and so does the server", async ({ page, apps }) => {
  const id = await apps.create("NoFile");
  await fillUpload(page, { version: "1.0" });
  await page.getByTestId("upload-submit").click();
  await expectBlockedByBrowser(page, id, "upload-file", "valueMissing");

  await skipBrowserChecks(page);
  await page.getByTestId("upload-submit").click();
  await expectRefused(page, id, "file.missing");
});

test("a historic date in the future is refused", async ({ page, apps }) => {
  const id = await apps.create("Future");
  await uploadRelease(page, {
    version: "1.0",
    historicDate: daysFromToday(2),
    file: files.write("game.zip", makeZip(sampleEntries())),
  });
  await expectRefused(page, id, "releaseDate.future");
});

test("a file that is not a zip is refused", async ({ page, apps }) => {
  const id = await apps.create("NotZip");
  await uploadRelease(page, { version: "1.0", file: files.write("notes.txt", Buffer.from("not a zip\n")) });
  await expectRefused(page, id, "file.notZip");
});

test("a truncated zip is refused", async ({ page, apps }) => {
  const id = await apps.create("Truncated");
  const zip = makeZip(sampleEntries());
  await uploadRelease(page, { version: "1.0", file: files.write("cut.zip", zip.subarray(0, zip.length / 2)) });
  await expectRefused(page, id, "file.notZip");
});

test("a zip over 4 MB: the browser blocks it, and so does the server", async ({ page, apps }) => {
  const id = await apps.create("TooBig");
  const big = makeZip([{ name: "BIG.BIN", data: randomBytes(MAX_UPLOAD_BYTES + 64 * 1024) }]);
  await fillUpload(page, { version: "1.0", file: files.write("big.zip", big) });
  await expect(page.getByTestId("upload-too-large")).toBeVisible();
  await expect(page.getByTestId("upload-submit")).toBeDisabled();

  await forceUploadSubmit(page);
  await expectRefused(page, id, "file.tooLarge");
});

test("an empty (0-byte) file is refused by the server", async ({ page, apps }) => {
  const id = await apps.create("Empty");
  const failed: string[] = [];
  // Only the upload's own request: in a production build the create action's
  // redirect and the link prefetches can end as aborted after create returns.
  // A POST that got its response can also be reported as aborted afterwards.
  page.on("requestfailed", async (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === `/publish/apps/${id}` &&
      !(await request.response())
    ) {
      failed.push(`${request.url()} ${request.failure()?.errorText}`);
    }
  });
  await uploadRelease(page, { version: "1.0", file: files.write("empty.zip", Buffer.alloc(0)) });
  await expectRefused(page, id, "file.missing");
  expect(failed).toEqual([]);
});
