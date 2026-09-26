import { ImapFlow } from "imapflow";
import type { Account } from "./settings";

const PIN_SUBJECT = "NBN:ID Login PIN";

async function withInbox<T>(account: Account, work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: true,
    auth: { user: account.imap.user, pass: account.imap.password },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    return await work(client);
  } finally {
    lock.release();
    await client.logout();
  }
}

// The UID the next message will get. Any PIN mail at or above it arrived after this call.
export function nextUid(account: Account): Promise<number> {
  return withInbox(account, async (client) => {
    const mailbox = client.mailbox;
    if (!mailbox || !mailbox.uidNext) {
      throw new Error(`No UIDNEXT for the inbox of ${account.imap.user}.`);
    }
    return mailbox.uidNext;
  });
}

export function messageCount(account: Account): Promise<number> {
  return withInbox(account, async (client) => (client.mailbox ? client.mailbox.exists : 0));
}

// Waits for a PIN mail with UID >= fromUid that arrived after startedAt, and returns the PIN.
export async function waitForPin(
  account: Account,
  fromUid: number,
  startedAt: Date,
  timeoutMs = 120_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  // The mail server stores whole seconds.
  const notBefore = startedAt.getTime() - 1000;
  while (Date.now() < deadline) {
    const pin = await withInbox(account, async (client) => {
      const uids = await client.search({ uid: `${fromUid}:*` }, { uid: true });
      // "n:*" always matches the newest message, even when its UID is below n.
      for (const uid of (uids || []).filter((u) => u >= fromUid).reverse()) {
        const message = await client.fetchOne(
          String(uid),
          { envelope: true, internalDate: true, source: true },
          { uid: true },
        );
        if (!message || !message.envelope?.subject?.includes(PIN_SUBJECT)) continue;
        const arrived = message.internalDate ? new Date(message.internalDate).getTime() : 0;
        if (arrived < notBefore) continue;
        // Undo quoted-printable soft line breaks before looking for the PIN.
        const body = (message.source?.toString("utf8") ?? "").replace(/=\r?\n/g, "");
        const match = body.match(/passcode is:\s*(\d{4,8})/);
        if (match) return match[1];
      }
      return null;
    });
    if (pin) return pin;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No new "${PIN_SUBJECT}" mail for ${account.imap.user} within ${timeoutMs / 1000} s.`);
}
