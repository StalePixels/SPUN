import { describe, expect, it } from "vitest";
import type { AppId } from "./apps";
import { fieldChanges, mailConfig, noticeMail, type Notice, type NoticeApp } from "./notices";

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

  it("a new publisher is named in the subject and links to their user page", () => {
    const user = { id: "user-9", username: "NewOne" };
    const mail = noticeMail({ kind: "publisherJoined", actorId: user.id }, null, user, BASE);
    expect(mail.subject).toBe("SPUN: New publisher: NewOne");
    expect(mail.text).toContain("New publisher: NewOne chose a username.");
    expect(mail.text).toContain(`  Admin, user NewOne: ${BASE}/admin/users/user-9`);
    expect(mail.text).not.toContain("/catalogue/");
  });
});
