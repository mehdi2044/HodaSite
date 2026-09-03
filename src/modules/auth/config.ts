import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no adapter, no bcrypt, no Prisma — only what the
 * middleware needs to *verify* a session JWT (secret + callbacks). The full
 * config in `./index.ts` spreads this and adds the Credentials provider and
 * the Prisma adapter (both Node-only).
 *
 * Admin sessions use the JWT strategy (signed, HTTP-only cookie): Auth.js v5
 * does not support the Credentials provider together with
 * `session.strategy: "database"`. Proposed ADR — see docs/PROGRESS.md.
 * Lifetime is deliberately short (8h); an admin re-authenticates daily.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
