import { describe, expect, it } from "vitest";
import type { AppId } from "./apps";
import { fieldChanges, mailConfig, noticeEvent, noticeMail, type Notice, type NoticeApp } from "./notices";

const BASE = "https://spun.example.com";
const owner = { id: "owner-1", username: "Owner" };
const admin = { id: "admin-1", username: "Admin" };
const app: NoticeApp = { id: "abc123" as AppId, title: "My Game", owner };
const appId = app.id;

describe("mailConfig", () => {
  const full = {
    SMTP_HOST: "relay.example.com",
    ADMIN_NOTIFY_EMAIL: "admin@example.com",
    MAIL_FROM: "spun@example.com",
    AUTH_URL: "https://spun.example.com/",
  };

  it("is null, so no mail is sent, without SMTP_HOST or ADMIN_NOTIFY_EMAIL", () => {
    expect(mailConfig({})).toBeNull();
    expect(mailConfig({ ...full, SMTP_HOST: undefined })).toBeNull();
    expect(mailConfig({ ...full, SMTP_HOST: " " })).toBeNull();
    expect(mailConfig({ ...full, ADMIN_NOTIFY_EMAIL: "" })).toBeNull();
  });

  it("takes NBN:ID's SMTP settings, with port 25 and no TLS or login by default", () => {
    expect(mailConfig(full)).toEqual({
      smtp: { host: "relay.example.com", port: 25, secure: false },
      from: "spun@example.com",
      to: "admin@example.com",
      baseUrl: BASE,
      events: [],
      unknownEvents: [],
    });
    expect(mailConfig({ ...full, SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "u", SMTP_PASS: "p" })?.smtp).toEqual({
      host: "relay.example.com",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
  });

  it("sends from noreply at the CMS host when MAIL_FROM is not set", () => {
    expect(mailConfig({ ...full, MAIL_FROM: undefined })?.from).toBe('"SPUN" <noreply@spun.example.com>');
  });

  it("takes the events from NOTIFY_EVENTS, split by commas or spaces, and keeps unknown names apart", () => {
    const config = mailConfig({ ...full, NOTIFY_EVENTS: "SCREENSHOT, USER_JOIN app_create  APP_CREATE,BOGUS" });
    expect(config?.events).toEqual(["USER_JOIN", "APP_CREATE", "SCREENSHOT"]);
    expect(config?.unknownEvents).toEqual(["app_create", "BOGUS"]);
    expect(mailConfig({ ...full, NOTIFY_EVENTS: " " })?.events).toEqual([]);
  });
});

describe("noticeEvent", () => {
  it("gives each kind of notice its NOTIFY_EVENTS name", () => {
    expect(noticeEvent({ kind: "userJoined", actorId: "u" })).toBe("USER_JOIN");
    expect(noticeEvent({ kind: "publisherJoined", actorId: "u" })).toBe("PUBLISHER_JOIN");
    expect(noticeEvent({ kind: "appEdited", actorId: "u", appId, changes: [] })).toBe("APP_UPDATE");
    expect(noticeEvent({ kind: "screenshot", actorId: "u", appId, slot: 1, action: "removed" })).toBe("SCREENSHOT");
  });
});

describe("fieldChanges", () => {
  it("lists only the changed fields, with the old and the new value", () => {
    expect(
      fieldChanges({ Title: "A", Description: "same", Categories: "Games" }, { Title: "B", Description: "same", Categories: "Games, Demos" }),
    ).toEqual([
      { field: "Title", old: "A", new: "B" },
      { field: "Categories", old: "Games", new: "Games, Demos" },
    ]);
    expect(fieldChanges({ Title: "A" }, { Title: "A" })).toEqual([]);
  });
});

describe("noticeMail", () => {
  it("a new release: subject, summary, changelog, files, dot moves and links", () => {
    const notice: Notice = {
      kind: "releaseUploaded",
      actorId: owner.id,
      appId,
      serial: 3,
      version: "1.2",
      releaseDate: "2026-10-05",
      changelog: "Fixed the border.\nAdded sound.",
      files: ["README.TXT", "mygame.dot"],
      dotMoves: [{ file: "mygame.dot", to: "C:/dot/mygame" }],
    };
    const mail = noticeMail(notice, app, owner, BASE);
    expect(mail.subject).toBe("SPUN: New release: My Game (abc123)");
    const lines = mail.text.split("\n");
    expect(lines[0]).toBe("New release: My Game (abc123), version 1.2, release 3, by Owner.");
    for (const line of [
      "  Fixed the border.",
      "  Added sound.",
      "  README.TXT",
      "  mygame.dot -> C:/dot/mygame",
      `  Public page: ${BASE}/catalogue/abc123`,
      `  Admin, app: ${BASE}/admin/apps/abc123`,
      `  Admin, release: ${BASE}/admin/apps/abc123/releases/3`,
      `  Admin, publisher Owner: ${BASE}/admin/users/owner-1`,
    ]) {
      expect(lines).toContain(line);
    }
    expect(mail.text).not.toContain("acting user");
  });

  it("names the acting admin, with a link to their user page, when it is not the owner", () => {
    const mail = noticeMail({ kind: "appDeleted", actorId: admin.id, appId }, app, admin, BASE);
    expect(mail.subject).toBe("SPUN: App deleted: My Game (abc123)");
    expect(mail.text).toContain("App deleted: My Game (abc123), by Admin.");
    expect(mail.text).toContain("Deleted: the app My Game (abc123), with its releases and screenshots.");
    expect(mail.text).toContain(`  Admin, acting user Admin: ${BASE}/admin/users/admin-1`);
  });

  it("an edit lists each changed field with its old and new value", () => {
    const notice: Notice = {
      kind: "appEdited",
      actorId: owner.id,
      appId,
      changes: [{ field: "Title", old: "Old Game", new: "My Game" }],
    };
    const text = noticeMail(notice, app, owner, BASE).text;
    expect(text).toContain("Title:\n  Old:\n    Old Game\n  New:\n    My Game\n");
  });

  it("a changelog edit has its own subject; an edit of other release fields does not", () => {
    const changelog: Notice = {
      kind: "releaseEdited",
      actorId: owner.id,
      appId,
      serial: 1,
      version: "1.0",
      changes: [{ field: "Changelog", old: "", new: "New text" }],
    };
    expect(noticeMail(changelog, app, owner, BASE).subject).toBe("SPUN: Changelog edited: My Game (abc123)");
    expect(noticeMail(changelog, app, owner, BASE).text).toContain("  Old:\n    (empty)\n");
    const version: Notice = { ...changelog, changes: [{ field: "Version", old: "1.0", new: "1.0a" }] };
    expect(noticeMail(version, app, owner, BASE).subject).toBe("SPUN: Release edited: My Game (abc123)");
  });

  it("a screenshot names the action and the slot", () => {
    const mail = noticeMail({ kind: "screenshot", actorId: owner.id, appId, slot: 2, action: "replaced" }, app, owner, BASE);
    expect(mail.subject).toBe("SPUN: Screenshot replaced: My Game (abc123)");
    expect(mail.text).toContain("Slot: 2");
  });

  it("an added or replaced screenshot goes with the mail as a PNG; a removed one does not", () => {
    const png = Buffer.from("png");
    const added = noticeMail({ kind: "screenshot", actorId: owner.id, appId, slot: 2, action: "added" }, app, owner, BASE, png);
    expect(added.attachments).toEqual([{ filename: "abc123-2.png", content: png, contentType: "image/png" }]);
    expect(added.text).toContain("The screenshot is attached.");
    const removed = noticeMail({ kind: "screenshot", actorId: owner.id, appId, slot: 2, action: "removed" }, app, owner, BASE, png);
    expect(removed.attachments).toEqual([]);
    expect(removed.text).not.toContain("attached");
    const missing = noticeMail({ kind: "screenshot", actorId: owner.id, appId, slot: 2, action: "added" }, app, owner, BASE);
    expect(missing.attachments).toEqual([]);
    expect(missing.text).not.toContain("attached");
  });

  it("lists the app, its publisher and a different acting user, with their details", () => {
    const detailed: NoticeApp = {
      ...app,
      details: { Title: "My Game", Downloads: "12" },
      owner: { ...owner, details: { Username: "Owner", Email: "owner@example.com" } },
    };
    const actor = { ...admin, details: { Username: "Admin", Admin: "yes" } };
    const text = noticeMail({ kind: "appDeleted", actorId: admin.id, appId }, detailed, actor, BASE).text;
    expect(text).toContain("App:\n  Title: My Game\n  Downloads: 12\n");
    expect(text).toContain("Publisher Owner:\n  Username: Owner\n  Email: owner@example.com\n");
    expect(text).toContain("Acting user Admin:\n  Username: Admin\n  Admin: yes\n");
    const own = noticeMail({ kind: "appDeleted", actorId: owner.id, appId }, detailed, detailed.owner, BASE).text;
    expect(own).not.toContain("Acting user");
  });

  it("a new app lists its fields once, not again as the app", () => {
    const detailed: NoticeApp = { ...app, details: { Title: "My Game" } };
    const text = noticeMail({ kind: "appCreated", actorId: owner.id, appId, fields: { Title: "My Game" } }, detailed, owner, BASE).text;
    expect(text).toContain("Details:\n  Title: My Game\n");
    expect(text).not.toContain("App:");
  });

  it("a deleted app has no public page link", () => {
    const deleted = noticeMail({ kind: "appDeleted", actorId: owner.id, appId }, app, owner, BASE).text;
    expect(deleted).not.toContain("/catalogue/");
    const edited = noticeMail({ kind: "appEdited", actorId: owner.id, appId, changes: [] }, app, owner, BASE).text;
    expect(edited).toContain(`  Public page: ${BASE}/catalogue/abc123`);
  });

  it("a new user is named by email, with their details and their user page", () => {
    const user = { id: "user-7", username: null, details: { Username: "(none yet)", Email: "new@example.com" } };
    const mail = noticeMail({ kind: "userJoined", actorId: user.id }, null, user, BASE);
    expect(mail.subject).toBe("SPUN: New user: new@example.com");
    expect(mail.text).toContain("New user: new@example.com logged in for the first time.");
    expect(mail.text).toContain("User:\n  Username: (none yet)\n  Email: new@example.com\n");
    expect(mail.text).toContain(`${BASE}/admin/users/user-7`);
  });

  it("a new publisher is named in the subject and links to their user page", () => {
    const user = { id: "user-9", username: "NewOne" };
    const mail = noticeMail({ kind: "publisherJoined", actorId: user.id }, null, user, BASE);
    expect(mail.subject).toBe("SPUN: New publisher: NewOne");
    expect(mail.text).toContain("New publisher: NewOne chose a username.");
    expect(mail.text).toContain(`  Admin, user NewOne: ${BASE}/admin/users/user-9`);
    expect(mail.text).not.toContain("/catalogue/");
  });
});
