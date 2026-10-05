import type { APIResponse } from "@playwright/test";
import { newNonce, signedFetch, splitKey, type ApiKey } from "../support/api";
import { apiKeyRow, insertApp, insertUser, liveAppIdsOf, removeTestUser, userByUsername } from "../support/db";
import { clickHydrated, expect, test } from "../support/pages";
import { accounts, settings } from "../support/settings";

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), code).toBe(status);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code }) }));
}

test("a user makes an API key from the API keys tab of /me, signs requests with it, and deletes it", async ({ page }) => {
  const client = await userByUsername(accounts.client.username);
  const otherUser = await insertUser(`e2ekey${Date.now().toString(36)}`.slice(0, 16));
  try {
    const otherApp = await insertApp(otherUser, "E2E other user's app");

    await page.goto("/");
    await page.getByTestId("navbar").getByTestId("nav-username").click();
    await expect(page).toHaveURL((url) => url.pathname === "/me");
    await expect(page.getByTestId("me-username")).toHaveText(accounts.client.username);
    await expect(page.getByTestId("me-email")).toHaveText(accounts.client.email);
    await page.getByTestId("me-menu-keys").click();
    await expect(page).toHaveURL((url) => url.pathname === "/me/keys");

    const name = `E2E key ${Date.now().toString(36)}`;
    await page.getByTestId("key-name-field").fill(name);
    await clickHydrated(page.getByTestId("key-submit"));
    const secretText = (await page.getByTestId("key-secret").textContent()) ?? "";
    const key: ApiKey = splitKey(secretText.trim());
    const row = page.getByTestId(`key-${key.keyId}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("key-name")).toHaveText(name);
    expect(await apiKeyRow(key.keyId)).toMatchObject({ user_id: client.id, name, deleted_at: null });

    await page.reload();
    await expect(row).toBeVisible();
    await expect(page.getByTestId("key-secret"), "the key is shown only once").toHaveCount(0);

    const list = await signedFetch(page.request, key, "/api/apps");
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { apps: { id: string; title: string }[] };
    const ids = body.apps.map((app) => app.id);
    expect([...ids].sort()).toEqual((await liveAppIdsOf(client.id)).sort());
    expect(ids).toContain(settings.testApp);
    expect(ids).not.toContain(otherApp);

    await expectRefusal(
      await signedFetch(page.request, key, "/api/apps", { secret: "0".repeat(64) }),
      401,
      "api.badSignature",
    );
    await expectRefusal(
      await signedFetch(page.request, key, "/api/apps", { timestamp: Math.floor(Date.now() / 1000) - 400 }),
      401,
      "api.oldRequest",
    );
    await expectRefusal(
      await signedFetch(page.request, key, "/api/apps", { omit: "X-SPUN-Nonce" }),
      401,
      "api.missingHeader",
    );
    const nonce = newNonce();
    expect((await signedFetch(page.request, key, "/api/apps", { nonce })).status()).toBe(200);
    await expectRefusal(await signedFetch(page.request, key, "/api/apps", { nonce }), 401, "api.nonceUsed");

    const tooLarge = await signedFetch(page.request, key, "/api/apps", { data: Buffer.alloc(64 * 1024 + 1, 0x20) });
    await expectRefusal(tooLarge, 413, "api.bodyTooLarge");
    expect((await tooLarge.json()).error.max).toBe(64 * 1024);

    await clickHydrated(row.getByTestId("delete-key"));
    await page.getByTestId("delete-key-confirm").click();
    await expect(row).toHaveCount(0);
    expect((await apiKeyRow(key.keyId))?.deleted_at).not.toBeNull();
    await expectRefusal(await signedFetch(page.request, key, "/api/apps"), 401, "api.badKey");
  } finally {
    await removeTestUser(otherUser);
  }
});
