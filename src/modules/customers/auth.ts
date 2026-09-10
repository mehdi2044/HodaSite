import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyCustomerOtp } from "./otp";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure:
    process.env.NODE_ENV === "production" &&
    (process.env.APP_URL ?? "").startsWith("https:"),
};
export const {
  auth: customerAuth,
  handlers: customerHandlers,
  signIn: customerSignIn,
  signOut: customerSignOut,
} = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  basePath: "/api/customer-auth",
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  cookies: {
    sessionToken: { name: "hoda.customer.session", options: cookieOptions },
    csrfToken: { name: "hoda.customer.csrf", options: cookieOptions },
    callbackUrl: { name: "hoda.customer.callback", options: cookieOptions },
  },
  providers: [
    Credentials({
      id: "customer-otp",
      credentials: { challengeId: {}, code: {}, token: {} },
      authorize: async (raw) => {
        const customer = await verifyCustomerOtp(raw);
        return customer
          ? {
              id: customer.id,
              email: customer.email,
              name: customer.firstName,
              sessionVersion: customer.sessionVersion,
            }
          : null;
      },
    }),
  ],
  events: {
    signIn: async ({ user }) => {
      if (user.id) {
        const { mergeCustomerCart } = await import("@/modules/cart");
        await mergeCustomerCart(user.id);
      }
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = (
          user as { sessionVersion?: number }
        ).sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        (session as unknown as { sessionVersion: unknown }).sessionVersion =
          token.sessionVersion;
      }
      return session;
    },
  },
});
export async function currentCustomer() {
  const session = await customerAuth();
  if (!session?.user?.id) return null;
  const customer = await db.customer.findUnique({
    where: { id: session.user.id },
  });
  return customer?.isActive &&
    customer.sessionVersion ===
      (session as unknown as { sessionVersion: unknown }).sessionVersion
    ? customer
    : null;
}
