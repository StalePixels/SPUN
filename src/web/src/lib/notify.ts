import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { createTransport, type Transporter } from "nodemailer";
import { apps, releases, users } from "@/db/schema";
import type { AppId } from "./apps";
import { appCategoryList } from "./categories";
import { db } from "./db";
import {
  mailConfig,
  noticeEvent,
  noticeMail,
  type MailConfig,
  type Notice,
  type NoticeApp,
  type NoticeUser,
} from "./notices";
import { readScreenshotPng } from "./storage";

let transporter: { key: string; transport: Transporter } | null = null;

function transportFor(config: MailConfig): Transporter {
  const key = JSON.stringify(config.smtp);
  if (transporter?.key !== key) {
    transporter = { key, transport: createTransport(config.smtp) };
  }
  return transporter.transport;
}

async function noticeUser(id: string): Promise<NoticeUser> {
  const [row] = await db().select().from(users).where(eq(users.id, id));
  if (!row) {
    return { id, username: null };
  }
  const [owned] = await db()
    .select({ total: count() })
    .from(apps)
    .where(and(eq(apps.userId, id), isNull(apps.deletedAt)));
  return {
    id,
    username: row.username,
    details: {
      Username: row.username ?? "(none yet)",
      Name: row.name ?? "",
      Email: row.email ?? "",
      Joined: row.createdAt.toISOString().slice(0, 16).replace("T", " "),
      Admin: row.isAdmin ? "yes" : "no",
      Apps: String(owned?.total ?? 0),
      ...(row.disabledAt ? { Disabled: row.disabledAt.toISOString().slice(0, 16).replace("T", " ") } : {}),
    },
  };
}

async function noticeApp(id: AppId): Promise<NoticeApp | null> {
  const [row] = await db()
    .select({ id: apps.id, title: apps.title, ownerId: apps.userId, downloads: apps.downloads })
    .from(apps)
    .where(eq(apps.id, id));
  if (!row) {
    return null;
  }
  const [latest] = await db()
    .select({ version: releases.version, serial: releases.serial })
    .from(releases)
    .where(and(eq(releases.appId, id), isNull(releases.deletedAt)))
    .orderBy(desc(releases.serial))
    .limit(1);
  return {
    id: row.id,
    title: row.title,
    owner: await noticeUser(row.ownerId),
    details: {
      ...(await appSnapshot(id)),
      "Latest release": latest ? `version ${latest.version}, release ${latest.serial}` : "(none)",
      Downloads: String(row.downloads),
    },
  };
}

export async function sendNotice(config: MailConfig, notice: Notice, transport: Transporter): Promise<void> {
  const app = "appId" in notice ? await noticeApp(notice.appId) : null;
  const screenshot = notice.kind === "screenshot" ? await readScreenshotPng(notice.appId, notice.slot) : null;
  const mail = noticeMail(notice, app, await noticeUser(notice.actorId), config.baseUrl, screenshot);
  await transport.sendMail({
    from: config.from,
    to: config.to,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments,
  });
}

// After the response, so a slow or failing mail server never holds up or fails the action.
export function notify(notice: Notice): void {
  const config = mailConfig(process.env);
  if (!config) {
    return;
  }
  if (config.unknownEvents.length > 0) {
    console.error(`NOTIFY_EVENTS has unknown names, which send no mail: ${config.unknownEvents.join(", ")}`);
  }
  if (!config.events.includes(noticeEvent(notice))) {
    return;
  }
  try {
    after(async () => {
      try {
        await sendNotice(config, notice, transportFor(config));
      } catch (err) {
        console.error(`Admin notice mail (${notice.kind}) failed:`, err);
      }
    });
  } catch (err) {
    console.error(`Admin notice mail (${notice.kind}) not sent:`, err);
  }
}

// The app fields a publisher or an admin can change, as the notice shows them.
export async function appSnapshot(appId: AppId): Promise<Record<string, string>> {
  const [row] = await db()
    .select({ title: apps.title, description: apps.description, installDir: apps.installDir })
    .from(apps)
    .where(eq(apps.id, appId));
  const categories = await appCategoryList(appId);
  return {
    Title: row?.title ?? "",
    Description: row?.description ?? "",
    "Install directory": row?.installDir ?? "",
    Categories: categories.map((category) => category.name).join(", "),
  };
}

export async function releaseSnapshot(appId: AppId, serial: number): Promise<Record<string, string>> {
  const [row] = await db()
    .select({ version: releases.version, releaseDate: releases.releaseDate, changelog: releases.changelog })
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.serial, serial)));
  return { Version: row?.version ?? "", "Release date": row?.releaseDate ?? "", Changelog: row?.changelog ?? "" };
}
