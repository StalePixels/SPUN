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
  | { kind: "publisherJoined"; actorId: string }
  | { kind: "userJoined"; actorId: string };

// The names NOTIFY_EVENTS takes. Each one more is one more kind of mail.
export const NOTIFY_EVENTS = [
  "USER_JOIN",
  "PUBLISHER_JOIN",
  "APP_CREATE",
  "APP_UPDATE",
  "APP_DELETE",
  "RELEASE_CREATE",
  "RELEASE_UPDATE",
  "RELEASE_DELETE",
  "SCREENSHOT",
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

const NOTICE_EVENTS: Record<Notice["kind"], NotifyEvent> = {
  userJoined: "USER_JOIN",
  publisherJoined: "PUBLISHER_JOIN",
  appCreated: "APP_CREATE",
  appEdited: "APP_UPDATE",
  appDeleted: "APP_DELETE",
  releaseUploaded: "RELEASE_CREATE",
  releaseEdited: "RELEASE_UPDATE",
  releaseDeleted: "RELEASE_DELETE",
  screenshot: "SCREENSHOT",
};

export function noticeEvent(notice: Notice): NotifyEvent {
  return NOTICE_EVENTS[notice.kind];
}

// details: what the mail lists about the user or the app, label by label.
export type NoticeUser = { id: string; username: string | null; details?: Record<string, string> };
export type NoticeApp = { id: AppId; title: string; owner: NoticeUser; details?: Record<string, string> };

export type MailAttachment = { filename: string; content: Buffer; contentType: string };
export type MailText = { subject: string; text: string; attachments: MailAttachment[] };

const EVENTS: Record<Notice["kind"], string> = {
  appCreated: "New app",
  appEdited: "App edited",
  appDeleted: "App deleted",
  releaseUploaded: "New release",
  releaseEdited: "Release edited",
  releaseDeleted: "Release deleted",
  screenshot: "Screenshot",
  publisherJoined: "New publisher",
  userJoined: "New user",
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
  return user.username ?? (user.details?.Email || `(no username, user ${user.id})`);
}

function fieldLines(fields: Record<string, string>): string[] {
  return Object.entries(fields).map(([field, value]) => `${field}: ${value === "" ? "(empty)" : value}`);
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
      return block("Details:", fieldLines(notice.fields));
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
    case "userJoined":
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
  if (notice.kind === "userJoined") {
    return `New user: ${actor.details?.Email || actor.id} logged in for the first time.`;
  }
  return `${what}:${on}${release}, by ${name(actor)}.`;
}

function subjectOf(notice: Notice, app: NoticeApp | null, actor: NoticeUser): string {
  const what = eventName(notice);
  if (notice.kind === "publisherJoined") {
    return `SPUN: ${what}: ${name(actor)}`;
  }
  if (notice.kind === "userJoined") {
    return `SPUN: ${what}: ${actor.details?.Email || actor.id}`;
  }
  return `SPUN: ${what}: ${app?.title} (${notice.appId})`;
}

// The app as it is now, the publisher, and the acting user when that is someone else.
function context(notice: Notice, app: NoticeApp | null, actor: NoticeUser): string[] {
  const lines: string[] = [];
  if (app?.details && notice.kind !== "appCreated") {
    lines.push(...block("App:", fieldLines(app.details)));
  }
  if (app?.owner.details) {
    lines.push(...block(`Publisher ${name(app.owner)}:`, fieldLines(app.owner.details)));
  }
  if ((!app || app.owner.id !== actor.id) && actor.details) {
    lines.push(...block(app ? `Acting user ${name(actor)}:` : "User:", fieldLines(actor.details)));
  }
  return lines;
}

// baseUrl is the CMS's own URL (AUTH_URL), with no slash at the end. screenshot is the PNG of the
// added or replaced screenshot, which goes with the mail as an attachment.
export function noticeMail(
  notice: Notice,
  app: NoticeApp | null,
  actor: NoticeUser,
  baseUrl: string,
  screenshot: Buffer | null = null,
): MailText {
  const links: string[] = [];
  if (app) {
    if (notice.kind !== "appDeleted") {
      links.push(`Public page: ${baseUrl}/catalogue/${app.id}`);
    }
    links.push(`Admin, app: ${baseUrl}/admin/apps/${app.id}`);
    if ("serial" in notice && notice.kind !== "releaseDeleted") {
      links.push(`Admin, release: ${baseUrl}/admin/apps/${app.id}/releases/${notice.serial}`);
    }
    links.push(`Admin, publisher ${name(app.owner)}: ${baseUrl}/admin/users/${app.owner.id}`);
  }
  if (!app || app.owner.id !== actor.id) {
    links.push(`Admin, ${app ? "acting user " : "user "}${name(actor)}: ${baseUrl}/admin/users/${actor.id}`);
  }
  const attachments: MailAttachment[] = [];
  const shown = notice.kind === "screenshot" && notice.action !== "removed" && screenshot !== null;
  if (shown) {
    attachments.push({ filename: `${notice.appId}-${notice.slot}.png`, content: screenshot, contentType: "image/png" });
  }
  const text = [
    summary(notice, app, actor),
    "",
    ...details(notice, app),
    ...(shown ? ["The screenshot is attached.", ""] : []),
    ...context(notice, app, actor),
    "Links:",
    ...links.map((link) => `  ${link}`),
    "",
  ];
  return { subject: subjectOf(notice, app, actor), text: text.join("\n"), attachments };
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
  events: NotifyEvent[];
  unknownEvents: string[];
};

// The same SMTP_* settings as NBN:ID. Null, so no mail, without SMTP_HOST or ADMIN_NOTIFY_EMAIL.
// Only the events named in NOTIFY_EVENTS send mail; with none named, no mail is sent.
export function mailConfig(env: Record<string, string | undefined>): MailConfig | null {
  const host = env.SMTP_HOST?.trim();
  const to = env.ADMIN_NOTIFY_EMAIL?.trim();
  const names = (env.NOTIFY_EVENTS ?? "").split(/[\s,]+/).filter((name) => name !== "");
  const events = NOTIFY_EVENTS.filter((event) => names.includes(event));
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
    events,
    unknownEvents: names.filter((name) => !(NOTIFY_EVENTS as readonly string[]).includes(name)),
  };
}
