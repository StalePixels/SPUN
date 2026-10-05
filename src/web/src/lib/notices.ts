import type { AppId } from "./apps";
import type { DotMove } from "./dotcommands";

// The admin notice mails: what happened, as plain data, and the mail text for it.

export type FieldChange = { field: string; old: string; new: string };

export type Notice =
  | { kind: "appCreated"; actorId: string; appId: AppId; fields: Record<string, string> }
  | { kind: "appEdited"; actorId: string; appId: AppId; changes: FieldChange[] }
  | { kind: "appDeleted"; actorId: string; appId: AppId }
  | {
      kind: "releaseUploaded";
      actorId: string;
      appId: AppId;
      serial: number;
      version: string;
      releaseDate: string;
      changelog: string | null;
      files: string[];
      dotMoves: DotMove[];
    }
  | { kind: "releaseEdited"; actorId: string; appId: AppId; serial: number; version: string; changes: FieldChange[] }
  | { kind: "releaseDeleted"; actorId: string; appId: AppId; serial: number; version: string }
  | { kind: "screenshot"; actorId: string; appId: AppId; slot: number; action: "added" | "replaced" | "removed" }
  | { kind: "publisherJoined"; actorId: string };

export type NoticeUser = { id: string; username: string | null };
export type NoticeApp = { id: AppId; title: string; owner: NoticeUser };

export type MailText = { subject: string; text: string };

const EVENTS: Record<Notice["kind"], string> = {
  appCreated: "New app",
  appEdited: "App edited",
  appDeleted: "App deleted",
  releaseUploaded: "New release",
  releaseEdited: "Release edited",
  releaseDeleted: "Release deleted",
  screenshot: "Screenshot",
  publisherJoined: "New publisher",
};

function eventName(notice: Notice): string {
  if (notice.kind === "releaseEdited" && notice.changes.every((change) => change.field === "Changelog")) {
    return "Changelog edited";
  }
  if (notice.kind === "screenshot") {
    return `Screenshot ${notice.action}`;
  }
  return EVENTS[notice.kind];
}

function name(user: NoticeUser): string {
  return user.username ?? `(no username, user ${user.id})`;
}

function block(title: string, lines: string[]): string[] {
  return [title, ...(lines.length === 0 ? ["  (none)"] : lines.map((line) => `  ${line}`)), ""];
}

function indented(text: string | null): string[] {
  return text === null || text === "" ? [] : text.split("\n");
}

// Each changed value in full, as the old and the new text can be long.
function changeLines(changes: FieldChange[]): string[] {
  return changes.flatMap((change) => [
    `${change.field}:`,
    "  Old:",
    ...indented(change.old || "(empty)").map((line) => `    ${line}`),
    "  New:",
    ...indented(change.new || "(empty)").map((line) => `    ${line}`),
    "",
  ]);
}

function details(notice: Notice, app: NoticeApp | null): string[] {
  switch (notice.kind) {
    case "appCreated":
      return block(
        "Details:",
        Object.entries(notice.fields).map(([field, value]) => `${field}: ${value === "" ? "(empty)" : value}`),
      );
    case "appEdited":
      return ["Changes:", "", ...changeLines(notice.changes)];
    case "appDeleted":
      return [`Deleted: the app ${app?.title} (${notice.appId}), with its releases and screenshots.`, ""];
    case "releaseUploaded":
      return [
        `Release date: ${notice.releaseDate}`,
        "",
        ...block("Changelog:", indented(notice.changelog)),
        ...block("Files:", notice.files),
        ...block(
          "Dot command moves:",
          notice.dotMoves.map((move) => `${move.file} -> ${move.to}`),
        ),
      ];
    case "releaseEdited":
      return ["Changes:", "", ...changeLines(notice.changes)];
    case "releaseDeleted":
      return [`Deleted: version ${notice.version}, release ${notice.serial}.`, ""];
    case "screenshot":
      return [`Slot: ${notice.slot}`, ""];
    case "publisherJoined":
      return [];
  }
}

function summary(notice: Notice, app: NoticeApp | null, actor: NoticeUser): string {
  const what = eventName(notice);
  const on = app ? ` ${app.title} (${app.id})` : "";
  const release =
    "serial" in notice ? `, version ${notice.version}, release ${notice.serial}` : "";
  if (notice.kind === "publisherJoined") {
    return `New publisher: ${name(actor)} chose a username.`;
  }
  return `${what}:${on}${release}, by ${name(actor)}.`;
}

// baseUrl is the CMS's own URL (AUTH_URL), with no slash at the end.
export function noticeMail(notice: Notice, app: NoticeApp | null, actor: NoticeUser, baseUrl: string): MailText {
  const what = eventName(notice);
  const subject =
    notice.kind === "publisherJoined" ? `SPUN: ${what}: ${name(actor)}` : `SPUN: ${what}: ${app?.title} (${notice.appId})`;
  const links: string[] = [];
  if (app) {
    links.push(`Public page: ${baseUrl}/catalogue/${app.id}`, `Admin, app: ${baseUrl}/admin/apps/${app.id}`);
    if ("serial" in notice && notice.kind !== "releaseDeleted") {
      links.push(`Admin, release: ${baseUrl}/admin/apps/${app.id}/releases/${notice.serial}`);
    }
    links.push(`Admin, publisher ${name(app.owner)}: ${baseUrl}/admin/users/${app.owner.id}`);
  }
  if (!app || app.owner.id !== actor.id) {
    links.push(`Admin, ${app ? "acting user " : "user "}${name(actor)}: ${baseUrl}/admin/users/${actor.id}`);
  }
  const text = [summary(notice, app, actor), "", ...details(notice, app), "Links:", ...links.map((link) => `  ${link}`), ""];
  return { subject, text: text.join("\n") };
}

// Only the fields whose value changed, in the order of the snapshot.
export function fieldChanges(before: Record<string, string>, after: Record<string, string>): FieldChange[] {
  return Object.keys(after)
    .filter((field) => (before[field] ?? "") !== after[field])
    .map((field) => ({ field, old: before[field] ?? "", new: after[field] }));
}

export type MailConfig = {
  smtp: { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } };
  from: string;
  to: string;
  baseUrl: string;
};

// The same SMTP_* settings as NBN:ID. Null, so no mail, without SMTP_HOST or ADMIN_NOTIFY_EMAIL.
export function mailConfig(env: Record<string, string | undefined>): MailConfig | null {
  const host = env.SMTP_HOST?.trim();
  const to = env.ADMIN_NOTIFY_EMAIL?.trim();
  if (!host || !to) {
    return null;
  }
  const baseUrl = (env.AUTH_URL ?? "").replace(/\/+$/, "");
  const site = baseUrl === "" ? "localhost" : new URL(baseUrl).hostname;
  const port = Number(env.SMTP_PORT || 25);
  return {
    smtp: {
      host,
      port: Number.isInteger(port) && port > 0 ? port : 25,
      secure: env.SMTP_SECURE === "true",
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } } : {}),
    },
    from: env.MAIL_FROM?.trim() || `"SPUN" <noreply@${site}>`,
    to,
    baseUrl,
  };
}
