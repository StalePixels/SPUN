import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { terms, users } from "@/db/schema";
import { db } from "./db";
import type { Problem } from "./problems";
import { currentTermsOf } from "./rules";

// The database's clock decides when a version goes live, as publish "now" is its now().
export async function databaseNow(): Promise<Date> {
  const [row] = await db()
    .select({ now: sql`now()`.mapWith(terms.publishAt) })
    .from(sql`dual`);
  return row.now;
}

export async function currentTermsId(): Promise<number | null> {
  const rows = await db()
    .select({ id: terms.id, published: terms.published, publishAt: terms.publishAt })
    .from(terms)
    .where(and(eq(terms.published, true), isNull(terms.deletedAt)));
  return rows.length === 0 ? null : (currentTermsOf(rows, await databaseNow())?.id ?? null);
}

export async function currentTerms(): Promise<{ id: number; textHtml: string } | null> {
  const id = await currentTermsId();
  if (id === null) {
    return null;
  }
  const [row] = await db().select({ id: terms.id, textHtml: terms.textHtml }).from(terms).where(eq(terms.id, id));
  return row ?? null;
}

// The id is the version the user saw; a newer one may have gone live since.
export async function acceptTerms(userId: string, versionId: number): Promise<Problem | null> {
  if (versionId !== (await currentTermsId())) {
    return { code: "terms.notCurrent" };
  }
  await db().update(users).set({ acceptedTermsId: versionId }).where(eq(users.id, userId));
  return null;
}
