import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./config";
import {
  authenticateAdmin,
  validAdminSession,
  revokeAdminSession,
} from "./security";
import { getClientIp } from "@/lib/net";
const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, token: {} },
      authorize: (raw, request) =>
        authenticateAdmin(
          raw,
          getClientIp(request.headers) ?? "unknown",
          request.headers.get("user-agent") ?? "",
        ),
    }),
  ],
  events: {
    signOut: async (event) => {
      if ("token" in event && typeof event.token?.adminSessionId === "string")
        await revokeAdminSession(event.token.adminSessionId);
    },
  },
});
export const { handlers, signIn, signOut } = nextAuth;
export async function getAdminSession(allowEnrollment = false) {
  const session = await nextAuth.auth();
  if (
    !session?.user?.id ||
    !session.adminSessionId ||
    typeof session.sessionVersion !== "number"
  )
    return null;
  const row = await validAdminSession(
    session.user.id,
    session.adminSessionId,
    session.sessionVersion,
    allowEnrollment,
  );
  return row ? { ...session, enrollmentOnly: row.enrollmentOnly } : null;
}
export async function auth() {
  return getAdminSession();
}
