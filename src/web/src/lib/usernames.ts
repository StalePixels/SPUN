import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "./db";
import { usernameKey } from "./rules";

// exceptUserId lets a user keep their own name in another case.
export async function usernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.usernameLower, usernameKey(username)),
        exceptUserId === undefined ? undefined : ne(users.id, exceptUserId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
