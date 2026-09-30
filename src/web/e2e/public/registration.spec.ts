import { insertSession, insertUser, removeTestUser } from "../support/db";
import { pathname } from "../support/pages";
import { expect, test } from "../support/publisher";
import { settings } from "../support/settings";

// A logged-in user with no username has not finished registering. The user is
// inserted with a session row, and the session token is set as the Auth.js
// cookie, so no real account loses its username.
test("a logged-in user with no username is sent to /username from every page", async ({ page, publisher }) => {
  const appId = await publisher.create("Registration");
  await publisher.upload(appId, "1.0", 1);

  const userId = await insertUser(null);
  try {
    const token = await insertSession(userId);
    const secure = new URL(settings.baseUrl).protocol === "https:";
    await page.context().addCookies([
      {
        name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
        value: token,
        url: settings.baseUrl,
      },
    ]);
    for (const path of ["/", "/?page=2", `/apps/${appId}`, "/publish"]) {
      await page.goto(path);
      expect(pathname(page), path).toBe("/username");
    }
  } finally {
    await removeTestUser(userId);
  }
});
