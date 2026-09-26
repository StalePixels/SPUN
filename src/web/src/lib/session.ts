import "server-only";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { users } from "@/db/schema";
import { db } from "./db";

export async function currentUser(): Promise<{ id: string; username: string | null } | null> {
  const session = await auth();
  return session?.user ? { id: session.user.id, username: session.user.username } : null;
}

export async function requireUser(): Promise<{ id: string; username: string | null }> {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

export async function requirePublisher(): Promise<{ id: string; username: string }> {
  const user = await requireUser();
  if (!user.username) {
    redirect("/username");
  }
  return { id: user.id, username: user.username };
}

// Not a guard; requireAdmin() is in admin.ts.
export async function isAdmin(userId: string): Promise<boolean> {
  const [user] = await db().select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  return user?.isAdmin ?? false;
}

export async function makeAdminIfFirstUser(userId: string): Promise<void> {
  const [row] = await db().select({ n: count() }).from(users);
  if (row?.n === 1) {
    await db().update(users).set({ isAdmin: true }).where(eq(users.id, userId));
  }
}
