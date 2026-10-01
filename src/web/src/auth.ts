import NextAuth, { type DefaultSession } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, sessions, users } from "@/db/schema";
import { db } from "@/lib/db";
import { storeClaims } from "@/lib/redis";
import { createUser } from "@/lib/session";

declare module "next-auth" {
  interface Session {
    user: { id: string; username: string | null } & DefaultSession["user"];
  }
  interface User {
    username?: string | null;
    disabledAt?: Date | null;
  }
}

// The adapter's own createUser does not make the first admin.
function adapter(): Adapter {
  const base = DrizzleAdapter(db(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  });
  return {
    ...base,
    createUser: (user) =>
      createUser({ name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image }).then(
        (row) => ({ ...row, email: row.email ?? "" }),
      ),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const issuer = process.env.AUTH_NBN_ISSUER ?? "";
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return {
    adapter: adapter(),
    session: { strategy: "database" },
    trustHost: true,
    providers: [
      {
        id: "nbn",
        name: "Next Best Network",
        type: "oidc",
        issuer,
        clientId: process.env.AUTH_NBN_ID,
        clientSecret: process.env.AUTH_NBN_SECRET,
        // v5 discovery can miss these for a custom OIDC provider.
        authorization: { url: `${base}auth`, params: { scope: "openid email" } },
        token: `${base}token`,
        userinfo: `${base}me`,
        // oidc-provider keeps scope claims out of the ID token in the code flow.
        idToken: false,
        profile(profile) {
          return {
            id: profile.sub,
            name: typeof profile.display_name === "string" ? profile.display_name : null,
            email: typeof profile.email === "string" ? profile.email : null,
          };
        },
      },
    ],
    callbacks: {
      // For a known account, user is the users row.
      signIn({ user }) {
        return !user.disabledAt;
      },
      session({ session, user }) {
        return {
          ...session,
          user: { ...session.user, id: user.id, username: user.username ?? null },
        };
      },
    },
    events: {
      async signIn({ user, profile }) {
        if (user.id && profile) {
          await storeClaims(user.id, profile);
        }
      },
    },
  };
});
