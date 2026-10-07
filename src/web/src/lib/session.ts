import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { users } from "@/db/schema";
import { db } from "./db";
import { mustAcceptTerms } from "./rules";
import { currentTermsId } from "./terms";

export type SessionUser = { id: string; username: string | null; acceptedTermsId: number | null };

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user
    ? { id: session.user.id, username: session.user.username, acceptedTermsId: session.user.acceptedTermsId }
    : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

// Database sessions last long, so a newer version reaches users who logged in before it.
export async function requireTerms(user: SessionUser): Promise<void> {
  if (mustAcceptTerms(user.acceptedTermsId, await currentTermsId())) {
    redirect("/terms");
  }
}

// A logged-in user with no username has not finished registering.
export async function requireRegistration(): Promise<void> {
  const user = await currentUser();
  if (user && !user.username) {
    redirect("/username");
  }
  if (user) {
    await requireTerms(user);
  }
}

export async function requirePublisher(): Promise<{ id: string; username: string }> {
  const user = await requireUser();
  if (!user.username) {
    redirect("/username");
  }
  await requireTerms(user);
  return { id: user.id, username: user.username };
}

// Not a guard; requireAdmin() is in admin.ts.
export async function isAdmin(userId: string): Promise<boolean> {
  const [user] = await db().select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  return user?.isAdmin ?? false;
}

type NewUser = { name?: string | null; email: string; emailVerified?: Date | null; image?: string | null };

// The first admin is set in the same transaction that creates the user. The
// locking read makes a second sign-up wait, or deadlock and run again.
export async function createUser(data: NewUser): Promise<typeof users.$inferSelect> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db().transaction(async (tx) => {
        const admins = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.isAdmin, true))
          .limit(1)
          .for("update");
        const id = crypto.randomUUID();
        await tx.insert(users).values({
          id,
          name: data.name ?? null,
          email: data.email,
          emailVerified: data.emailVerified ?? null,
          image: data.image ?? null,
          isAdmin: admins.length === 0,
        });
        const [row] = await tx.select().from(users).where(eq(users.id, id));
        return row;
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (attempt < 5 && (e.code ?? e.cause?.code) === "ER_LOCK_DEADLOCK") {
        continue;
      }
      throw err;
    }
  }
}
