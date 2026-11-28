/**
 * Auth.js（NextAuth v5）の設定。
 *
 * - Credentials プロバイダで既存 `users` をそのまま認証する（bcrypt `$2b$12$` 互換）。
 * - セッションは JWT Cookie。httpOnly / sameSite=lax / 本番のみ secure。
 * - 秘密値は `AUTH_SECRET` のみ（値はコミットしない）。
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  buildSessionCookieOptions,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail } from "@/lib/auth/users";

const sessionMaxAge = sessionMaxAgeSeconds(
  process.env.AUTH_SESSION_MAX_AGE_DAYS,
);
const sessionCookie = buildSessionCookieOptions(
  process.env.NODE_ENV,
  sessionMaxAge,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: sessionMaxAge,
  },
  cookies: {
    sessionToken: {
      name: sessionCookieName(process.env.NODE_ENV),
      options: sessionCookie,
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === "string" ? credentials.email : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        const user = await findUserByEmail(email);
        if (!user) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        return { id: String(user.id), email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = String(token.uid);
      }
      return session;
    },
  },
});
