import "server-only";
import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import { db } from "./db";
import { parseLimit } from "./rules";

export const DEFAULT_APP_LIMIT = "default_app_limit";

export async function getSetting(slug: string) {
  const [row] = await db().select().from(settings).where(eq(settings.slug, slug));
  return row;
}

export async function defaultAppLimit(): Promise<number | null> {
  const parsed = parseLimit((await getSetting(DEFAULT_APP_LIMIT))?.value ?? "");
  return parsed.ok ? parsed.limit : null;
}
