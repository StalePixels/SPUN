import "server-only";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { createTransport, type Transporter } from "nodemailer";
import { apps, releases, users } from "@/db/schema";
import type { AppId } from "./apps";
import { appCategoryList } from "./categories";
import { db } from "./db";
import { mailConfig, noticeMail, type MailConfig, type Notice, type NoticeApp, type NoticeUser } from "./notices";

let transporter: { key: string; transport: Transporter } | null = null;

function transportFor(config: MailConfig): Transporter {
  const key = JSON.stringify(config.smtp);
  if (transporter?.key !== key) {
    transporter = { key, transport: createTransport(config.smtp) };
  }
  return transporter.transport;
}

async function noticeUser(id: string): Promise<NoticeUser> {
  const [row] = await db().select({ id: users.id, username: users.username }).from(users).where(eq(users.id, id));
  return row ?? { id, username: null };
}

async function noticeApp(id: AppId): Promise<NoticeApp | null> {
  const [row] = await db()
    .select({ id: apps.id, title: apps.title, ownerId: users.id, owner: users.username })
    .from(apps)
    .innerJoin(users, eq(users.id, apps.userId))
    .where(eq(apps.id, id));
  return row ? { id: row.id, title: row.title, owner: { id: row.ownerId, username: row.owner } } : null;
}

export async function sendNotice(config: MailConfig, notice: Notice, transport: Transporter): Promise<void> {
  const app = "appId" in notice ? await noticeApp(notice.appId) : null;
  const mail = noticeMail(notice, app, await noticeUser(notice.actorId), config.baseUrl);
  await transport.sendMail({ from: config.from, to: config.to, subject: mail.subject, text: mail.text });
}

// After the response, so a slow or failing mail server never holds up or fails the action.
export function notify(notice: Notice): void {
  const config = mailConfig(process.env);
  if (!config) {
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
