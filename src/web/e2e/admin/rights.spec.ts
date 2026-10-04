import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  aliasRow,
  appIdsOf,
  dotOverrideNames,
  appRow,
  firstLiveCategoryId,
  insertApp,
  linkCategory,
  insertSession,
  markAppDeleted,
  insertUser,
  releaseRow,
  removeTestUser,
  sessionCount,
  userRow,
} from "../support/db";
import {
  binFile,
  clickHydrated,
  test as base,
  expect,
  releaseFile,
  removeBinFiles,
  uniqueTitle,
  uploadRelease,
  waitForHydration,
} from "../support/pages";
import { settings } from "../support/settings";
import { makeZip, sampleEntries, tempFiles } from "../support/zips";

// Admin rights on other users' apps. Every user and app here is inserted by the
// test itself, so no real account is renamed, disabled or deleted. At the end
// the rows go, and so do their files in the data directory and the bin.

type TestUser = { id: string; username: string };
type People = {
  user(): Promise<TestUser>;
  app(owner: TestUser, label: string): Promise<string>;
};

function uniqueUsername(): string {
  return `E2E-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 16);
}

async function removeUserDir(userId: string): Promise<void> {
  const username = (await userRow(userId))?.username;
  if (username) {
    rmSync(path.join(settings.dataDir, username), { recursive: true, force: true });
  }
}

const test = base.extend<{ people: People }>({
  people: [
    async ({}, provide) => {
      const made: string[] = [];
      await provide({
        async user() {
          const username = uniqueUsername();
          const id = await insertUser(username);
          made.push(id);
          return { id, username };
        },
        async app(owner, label) {
          const id = await insertApp(owner.id, uniqueTitle(label));
          await linkCategory(id, await firstLiveCategoryId());
          return id;
        },
      });
      const appIds = (await Promise.all(made.map(appIdsOf))).flat();
      for (const id of made) {
        await removeUserDir(id);
      }
      removeBinFiles(appIds);
      for (const id of made) {
        await removeTestUser(id);
      }
    },
    { timeout: 30_000 },
  ],
});

let files: ReturnType<typeof tempFiles>;
test.beforeEach(() => {
  files = tempFiles();
});
test.afterEach(() => {
  files.remove();
});

async function adminUpload(page: Page, appId: string, version: string, serial: number) {
  await page.goto(`/admin/apps/${appId}`);
  await uploadRelease(page, { version, file: files.write(`${version}.zip`, makeZip(sampleEntries())) });
  await expect(page).toHaveURL(new RegExp(`/admin/apps/${appId}/releases/${serial}$`));
}

test("an admin gets not found on another user's publisher app page", async ({ page, people }) => {
  const owner = await people.user();
  const id = await people.app(owner, "Other");
  const response = await page.goto(`/publish/apps/${id}`);
  expect(response?.status()).toBe(404);
});

test("an admin opens, edits, uploads to, deletes and restores another user's app", async ({ page, people }) => {
  const owner = await people.user();
  const id = await people.app(owner, "Rights");

  await page.goto("/admin/apps");
  await page.getByTestId(`admin-app-${id}`).getByTestId("admin-app-link").click();
  await expect(page).toHaveURL(new RegExp(`/admin/apps/${id}$`));
  await expect(page.getByTestId("admin-app-owner")).toHaveText(owner.username);

  const title = uniqueTitle("Edited");
  await page.getByTestId("app-title").fill(title);
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect((await appRow(id))?.title).toBe(title);

  await adminUpload(page, id, "1.0", 1);
  const zip = releaseFile(owner.username, id, 1);
  expect(existsSync(zip)).toBe(true);

  await page.goto(`/admin/apps/${id}`);
  await clickHydrated(page.getByTestId("delete-app"));
  await page.getByTestId("delete-app-confirm").click();
  await expect(page.getByTestId("admin-app-deleted-note")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/apps/${id}$`));
  expect((await appRow(id))?.deleted_at).not.toBeNull();
  expect(existsSync(zip)).toBe(false);
  expect(existsSync(binFile(id, 1))).toBe(true);

  await clickHydrated(page.getByTestId("restore-app"));
  await expect(page.getByTestId("admin-app-deleted-note")).toHaveCount(0);
  expect((await appRow(id))?.deleted_at).toBeNull();
  expect(existsSync(zip)).toBe(true);
  expect(existsSync(binFile(id, 1))).toBe(false);
});

test("an admin saves another user's install directory through the same rules", async ({ page, people }) => {
  const owner = await people.user();
  const id = await people.app(owner, "Rights dir");
  await page.goto(`/admin/apps/${id}`);

  await page.getByTestId("app-install-dir").fill("apps\\theirs\\");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await appRow(id)).toMatchObject({ install_dir: "/apps/theirs" });
  await page.reload();
  await expect(page.getByTestId("app-install-dir")).toHaveValue("/apps/theirs");

  await page.getByTestId("app-install-dir").fill("/nextzxos/x");
  await clickHydrated(page.getByTestId("app-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "installDir.banned");
  expect(await appRow(id)).toMatchObject({ install_dir: "/apps/theirs" });
});

test("aliases: add, refuse bad names and clashes, move to another app, remove", async ({ page, people }) => {
  const owner = await people.user();
  const first = await people.app(owner, "Alias one");
  const second = await people.app(owner, "Alias two");
  const gone = await people.app(owner, "Alias gone");
  await markAppDeleted(gone);
  const alias = `e2e-${Date.now().toString(36)}`;
  const add = page.getByTestId("alias-add");

  async function addAlias(name: string) {
    await add.getByTestId("alias-add-name").fill(name);
    await clickHydrated(add.getByTestId("alias-add-submit"));
  }

  await page.goto(`/admin/apps/${first}`);
  await expect(page.getByTestId("aliases-none")).toBeVisible();
  await addAlias(alias.toUpperCase());
  await expect(add.getByTestId("form-saved")).toBeVisible();
  expect(await aliasRow(alias)).toEqual({ alias, app_id: first });
  await expect(page.getByTestId(`alias-${alias}`)).toBeVisible();

  // Each code differs from the one before, so each wait sees its own submit.
  for (const [name, code] of [
    ["bad name!", "alias.invalidCharacters"],
    [second.toUpperCase(), "alias.isAppId"],
    ["x".repeat(17), "alias.length"],
    [gone, "alias.isAppId"],
    [alias, "alias.taken"],
  ]) {
    await addAlias(name);
    await expect(add.getByTestId("form-error"), name).toHaveAttribute("data-error", code);
  }
  expect(await aliasRow(second)).toBeUndefined();
  expect(await aliasRow(gone)).toBeUndefined();

  const row = page.getByTestId(`alias-${alias}`);
  await row.getByTestId("alias-move-target").fill("zzzzzz");
  await clickHydrated(row.getByTestId("alias-move-submit"));
  await expect(row.getByTestId("form-error")).toHaveAttribute("data-error", "app.notFound");
  expect(await aliasRow(alias)).toEqual({ alias, app_id: first });

  await row.getByTestId("alias-move-target").fill(second.toUpperCase());
  await clickHydrated(row.getByTestId("alias-move-submit"));
  await expect(page.getByTestId(`alias-${alias}`)).toHaveCount(0);
  expect(await aliasRow(alias)).toEqual({ alias, app_id: second });

  await page.goto(`/admin/apps/${second}`);
  await clickHydrated(page.getByTestId(`alias-${alias}`).getByTestId("alias-remove"));
  await expect(page.getByTestId(`alias-${alias}`)).toHaveCount(0);
  expect(await aliasRow(alias), "a removed alias leaves no row").toBeUndefined();
});

test("dot command overrides: add in any case, refuse others and repeats, let uploads ship the name, remove", async ({
  page,
  people,
}) => {
  const owner = await people.user();
  const id = await people.app(owner, "Overrides");
  const add = page.getByTestId("dot-override-add");
  const spunZip = () => files.write("spun.zip", makeZip([...sampleEntries(), { name: "spun.dot", data: Buffer.from("a") }]));

  async function addOverride(name: string) {
    await add.getByTestId("dot-override-add-name").fill(name);
    await clickHydrated(add.getByTestId("dot-override-add-submit"));
  }

  await page.goto(`/admin/apps/${id}`);
  await expect(page.getByTestId("dot-overrides-none")).toBeVisible();
  await uploadRelease(page, { version: "1.0", file: spunZip() });
  await expect(page.getByTestId("form-error").first()).toHaveAttribute("data-error", "file.dotCommandTaken");
  expect(await releaseRow(id, 1)).toBeUndefined();

  await addOverride("SPUN");
  await expect(add.getByTestId("form-saved")).toBeVisible();
  expect(await dotOverrideNames(id)).toEqual(["spun"]);
  await expect(page.getByTestId("dot-override-spun")).toBeVisible();

  // Each code differs from the one before, so each wait sees its own submit.
  for (const [name, code] of [
    ["mytool", "dotOverride.notReserved"],
    ["Spun", "dotOverride.taken"],
  ]) {
    await addOverride(name);
    await expect(add.getByTestId("form-error"), name).toHaveAttribute("data-error", code);
  }
  expect(await dotOverrideNames(id)).toEqual(["spun"]);

  await uploadRelease(page, { version: "1.0", file: spunZip() });
  await expect(page).toHaveURL(new RegExp(`/admin/apps/${id}/releases/1$`));

  await page.goto(`/admin/apps/${id}`);
  await clickHydrated(page.getByTestId("dot-override-spun").getByTestId("dot-override-remove"));
  await expect(page.getByTestId("dot-override-spun")).toHaveCount(0);
  expect(await dotOverrideNames(id), "a removed override leaves no row").toEqual([]);
  await uploadRelease(page, { version: "2.0", file: spunZip() });
  await expect(page.getByTestId("form-error").first()).toHaveAttribute("data-error", "file.dotCommandTaken");
  expect(await releaseRow(id, 2)).toBeUndefined();
});

test("a move puts the zips under the new owner and changes the owner row", async ({ page, people }) => {
  const from = await people.user();
  const to = await people.user();
  const id = await people.app(from, "Move");
  await adminUpload(page, id, "1.0", 1);

  await page.goto(`/admin/apps/${id}`);
  await waitForHydration(page.getByTestId("move-user"));
  await page.getByTestId("move-user").selectOption(to.id);
  await clickHydrated(page.getByTestId("move-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();

  expect((await appRow(id))?.user_id).toBe(to.id);
  expect(existsSync(releaseFile(to.username, id, 1))).toBe(true);
  expect(existsSync(releaseFile(from.username, id, 1))).toBe(false);
  await page.reload();
  await expect(page.getByTestId("admin-app-owner")).toHaveText(to.username);
});

test("release edit: a version the app has is refused; delete and restore move the zip", async ({ page, people }) => {
  const owner = await people.user();
  const id = await people.app(owner, "Release");
  await adminUpload(page, id, "1.0", 1);
  await adminUpload(page, id, "1.1", 2);

  await page.getByTestId("release-edit-version").fill("1.0");
  await clickHydrated(page.getByTestId("release-edit-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "version.taken");
  expect((await releaseRow(id, 2))?.version).toBe("1.1");

  await page.getByTestId("release-edit-version").fill("1.2");
  await page.getByTestId("release-edit-date").fill("2001-02-03");
  await clickHydrated(page.getByTestId("release-edit-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect(await releaseRow(id, 2)).toMatchObject({ version: "1.2", release_date: "2001-02-03" });

  const zip = releaseFile(owner.username, id, 2);
  await clickHydrated(page.getByTestId("delete-release"));
  await page.getByTestId("delete-release-confirm").click();
  await expect(page.getByTestId("release-deleted")).toBeVisible();
  expect(existsSync(zip)).toBe(false);
  expect(existsSync(binFile(id, 2))).toBe(true);

  await clickHydrated(page.getByTestId("restore-release"));
  await expect(page.getByTestId("release-deleted")).toHaveCount(0);
  expect((await releaseRow(id, 2))?.deleted_at).toBeNull();
  expect(existsSync(zip)).toBe(true);
  expect(existsSync(binFile(id, 2))).toBe(false);
});

test("a rename moves the user's directory; a taken name is refused", async ({ page, people }) => {
  const user = await people.user();
  const other = await people.user();
  const id = await people.app(user, "Rename");
  await adminUpload(page, id, "1.0", 1);

  await page.goto(`/admin/users/${user.id}`);
  const field = page.getByTestId("user-username");
  await field.fill(other.username.toLowerCase());
  await clickHydrated(page.getByTestId("user-rename-submit"));
  await expect(page.getByTestId("form-error")).toHaveAttribute("data-error", "username.taken");
  expect((await userRow(user.id))?.username).toBe(user.username);

  const renamed = uniqueUsername();
  await field.fill(renamed);
  await clickHydrated(page.getByTestId("user-rename-submit"));
  await expect(page.getByTestId("form-saved")).toBeVisible();
  expect((await userRow(user.id))?.username).toBe(renamed);
  expect(existsSync(releaseFile(renamed, id, 1))).toBe(true);
  expect(existsSync(path.join(settings.dataDir, user.username))).toBe(false);
});

test("disable removes the sessions and enable clears the mark", async ({ page, people }) => {
  const user = await people.user();
  await insertSession(user.id);
  expect(await sessionCount(user.id)).toBe(1);

  await page.goto(`/admin/users/${user.id}`);
  await clickHydrated(page.getByTestId("user-disable"));
  await expect(page.getByTestId("user-enable")).toBeVisible();
  expect((await userRow(user.id))?.disabled_at).not.toBeNull();
  expect(await sessionCount(user.id)).toBe(0);

  await clickHydrated(page.getByTestId("user-enable"));
  await expect(page.getByTestId("user-disable")).toBeVisible();
  expect((await userRow(user.id))?.disabled_at).toBeNull();
});

test("delete disables the user and puts all their apps in the bin", async ({ page, people }) => {
  const user = await people.user();
  const first = await people.app(user, "DelUser1");
  const second = await people.app(user, "DelUser2");
  await adminUpload(page, first, "1.0", 1);
  await adminUpload(page, second, "1.0", 1);

  await page.goto(`/admin/users/${user.id}`);
  await clickHydrated(page.getByTestId("delete-user"));
  await page.getByTestId("delete-user-confirm").click();
  await expect(page.getByTestId("user-enable")).toBeVisible();

  expect((await userRow(user.id))?.disabled_at).not.toBeNull();
  for (const id of [first, second]) {
    expect((await appRow(id))?.deleted_at, id).not.toBeNull();
    expect(existsSync(releaseFile(user.username, id, 1)), id).toBe(false);
    expect(existsSync(binFile(id, 1)), id).toBe(true);
  }
});
