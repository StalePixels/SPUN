import { expect, test } from "@playwright/test";
import { userByUsername } from "../support/db";
import { accounts } from "../support/settings";

// After a reset the setup logs the admin account in first, on an empty users
// table, and the client after it. The first user becomes the admin; no later
// user does.
test("the first user to log in is the admin, and the client is not", async () => {
  expect((await userByUsername(accounts.admin.username)).is_admin).toBe(1);
  expect((await userByUsername(accounts.client.username)).is_admin).toBe(0);
});
