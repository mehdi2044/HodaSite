import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signValue, unseal } from "../../src/lib/secure-tokens";

/** Operator-only, readonly CLI diagnostic. Never expose this as a public route.
 * The returned object contains no email, password, hash, token or MFA secret. */
export async function inspectAdminLogin(
  db: PrismaClient,
  requestedEmail?: string,
  settings = {
    email: process.env.ADMIN_EMAIL ?? "owner@example.com",
    password: process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
  },
) {
  const email = (requestedEmail ?? settings.email).trim().toLowerCase();
  const configuredEmailMatches = email === settings.email.trim().toLowerCase();
  const users = await db.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
      mfaEnabled: true,
      mfaSecret: true,
    },
    take: 2,
  });
  const user = users.length === 1 ? users[0] : undefined;
  let mfaSecretReadable: boolean | null = null;
  if (user?.mfaEnabled) {
    try {
      mfaSecretReadable =
        !!user.mfaSecret && typeof unseal(user.mfaSecret) === "string";
    } catch {
      mfaSecretReadable = false;
    }
  }
  const throttle = process.env.AUTH_SECRET
    ? await db.authThrottle.findUnique({
        where: { id: signValue(`admin-limit:login:${email}`) },
        select: { attempts: true, windowStart: true },
      })
    : null;
  const remaining =
    throttle && throttle.attempts >= 10
      ? Math.max(
          0,
          Math.ceil(
            (throttle.windowStart.getTime() + 900000 - Date.now()) / 1000,
          ),
        )
      : 0;
  return {
    databaseReachable: true,
    authSecretConfigured: !!process.env.AUTH_SECRET,
    configuredEmailMatches,
    adminAccountFound: users.length > 0,
    ambiguousEmailCase: users.length > 1,
    storedEmailCaseMismatch: user ? user.email !== email : null,
    customerAccountOnly:
      users.length === 0 &&
      (await db.customer.count({
        where: { email: { equals: email, mode: "insensitive" } },
      })) > 0,
    accountActive: user?.isActive ?? null,
    configuredPasswordMatches:
      user && configuredEmailMatches
        ? await bcrypt.compare(settings.password, user.passwordHash)
        : null,
    mfaEnabled: user?.mfaEnabled ?? null,
    mfaSecretReadable,
    unusedRecoveryCodes: user
      ? await db.mfaRecoveryCode.count({
          where: { userId: user.id, usedAt: null },
        })
      : 0,
    accountRateLimitWaitSeconds: remaining,
  };
}
