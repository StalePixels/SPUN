import "server-only";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import MarkdownIt from "markdown-it";
import { apps, features } from "@/db/schema";
import type { AppId } from "./apps";
import { isPublic } from "./catalogue";
import { db } from "./db";

export type LiveFeature = { id: number; appId: AppId; title: string; article: string; articleHtml: string };

// The rule SPUNServer uses (src/server/src/mysqlCatalogue.ts): published, not
// deleted, its time passed, its app public. The query must join apps.
export function isLive() {
  return and(eq(features.published, true), isNull(features.deletedAt), lte(features.publishAt, sql`now()`), isPublic());
}

// Of the live features, the latest wins.
export async function liveFeature(): Promise<LiveFeature | null> {
  const [row] = await db()
    .select({
      id: features.id,
      appId: features.appId,
      title: apps.title,
      article: features.article,
      articleHtml: features.articleHtml,
    })
    .from(features)
    .innerJoin(apps, eq(apps.id, features.appId))
    .where(isLive())
    .orderBy(desc(features.publishAt), desc(features.id))
    .limit(1);
  return row ?? null;
}

// With raw HTML off, markdown-it's output needs no sanitizer (its docs/safety.md).
const markdown = new MarkdownIt({ html: false, breaks: true });

export function renderArticle(article: string): string {
  return markdown.render(article);
}
