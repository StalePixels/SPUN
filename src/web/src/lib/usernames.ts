import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "./db";
import { isDuplicateEntry } from "./dberrors";
import { notify } from "./notify";
import type { Problem } from "./problems";
import { checkUsernameInput, mustAcceptTerms, usernameKey } from "./rules";
import { currentTermsId } from "./terms";

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

// The end of registration: a user without a username chooses one, and accepts
// the current T&C version, the one the join page showed, when there is one.
export async function chooseUsername(
  user: { id: string; username: string | null },
  username: string,
  acceptedTermsId: number | null,
): Promise<Problem | null> {
  if (user.username) {
    return { code: "username.fixed" };
  }
  const error = checkUsernameInput(username);
  if (error) {
    return error;
  }
  if (await usernameTaken(username)) {
    return { code: "username.taken" };
  }
  const termsId = await currentTermsId();
  if (mustAcceptTerms(acceptedTermsId, termsId)) {
    return { code: acceptedTermsId === null ? "terms.notAccepted" : "terms.notCurrent" };
  }
  try {
    await db()
      .update(users)
      .set({ username, acceptedTermsId: termsId })
      .where(and(eq(users.id, user.id), isNull(users.username)));
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return { code: "username.taken" };
    }
    throw err;
  }
  notify({ kind: "publisherJoined", actorId: user.id });
  return null;
}
