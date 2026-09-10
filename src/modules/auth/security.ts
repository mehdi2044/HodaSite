import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";
import { db } from "@/lib/db";
import { seal, unseal, signValue } from "@/lib/secure-tokens";
import { withMutation } from "@/lib/mutation-gate";

type Tx = Prisma.TransactionClient;
export const adminIdentityInclude = {
  overrides: true,
  roles: { include: { role: { include: { permissions: true } } } },
} satisfies Prisma.UserInclude;
type Identity = Prisma.UserGetPayload<{ include: typeof adminIdentityInclude }>;
export function requiresMfa(user: { roles: {role: {key: string; permissions: {permission: string}[]}}[]; overrides: {allow: boolean; permission: string}[] }) {
  return (
    user.overrides.some(
      (o) =>
        o.allow &&
        ["users.manage", "security.role.manage"].includes(o.permission),
    ) ||
    user.roles.some(
      ({ role }) =>
        ["owner", "admin"].includes(role.key) ||
        role.permissions.some((p) =>
          ["*", "security.role.manage", "users.manage"].includes(p.permission),
        ),
    )
  );
}
export function totpFor(secret: string, issuer = "", label = "") {
  return new TOTP({
    secret,
    issuer,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
}
export function matchingStep(secret: string, token: string, now = Date.now()) {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totpFor(secret).validate({ token, timestamp: now, window: 1 });
  return delta === null ? null : BigInt(Math.floor(now / 30000) + delta);
}
export function recoveryHash(userId: string, code: string) {
  return signValue(
    `admin-recovery:${userId}:${code.replaceAll("-", "").toLowerCase()}`,
  );
}
export async function takeSecurityAttempt(
  key: string,
  limit = 10,
  now = new Date(),
) {
  const id = signValue(`admin-limit:${key}`);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
    const bucket = await tx.authThrottle.findUnique({ where: { id } });
    const fresh =
      !bucket || now.getTime() - bucket.windowStart.getTime() >= 900000;
    if (!fresh && bucket.attempts >= limit) return false;
    await tx.authThrottle.upsert({
      where: { id },
      create: { id, attempts: 1, windowStart: now },
      update: fresh
        ? { attempts: 1, windowStart: now }
        : { attempts: { increment: 1 } },
    });
    return true;
  });
}
async function clearLoginAttempts(email: string) {
  await db.authThrottle.deleteMany({
    where: { id: signValue(`admin-limit:login:${email}`) },
  });
}
// Caller holds the User row lock. Both TOTP and recovery consumption commit
// even when authentication is rejected elsewhere; never catch inside an aborted tx.
export async function consumeMfa(
  tx: Tx,
  user: Pick<Identity, "id" | "mfaEnabled" | "mfaSecret" | "mfaLastStep">,
  token: string,
  allowRecovery = true,
  now = Date.now(),
) {
  if (!user.mfaEnabled || !user.mfaSecret) return false;
  if (/^\d{6}$/.test(token)) {
    const secret = z.string().parse(unseal(user.mfaSecret));
    const step = matchingStep(secret, token, now);
    if (
      step === null ||
      (user.mfaLastStep !== null && step <= user.mfaLastStep)
    )
      return false;
    await tx.user.update({
      where: { id: user.id },
      data: { mfaLastStep: step },
    });
    return true;
  }
  if (!allowRecovery || !/^[a-fA-F0-9-]{24,32}$/.test(token)) return false;
  const result = await tx.mfaRecoveryCode.updateMany({
    where: {
      userId: user.id,
      codeHash: recoveryHash(user.id, token),
      usedAt: null,
    },
    data: { usedAt: new Date(now) },
  });
  return result.count === 1;
}
const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(256),
  token: z.string().max(64).default(""),
});
const dummyHash =
  "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
export async function authenticateAdmin(
  raw: unknown,
  ip: string,
  agent: string,
) {
  const input = loginSchema.safeParse(raw);
  if (!input.success) return null;
  const { email, password, token } = input.data;
  return withMutation(async () => {
    if (
      !(await takeSecurityAttempt(`ip:${ip}`, 150)) ||
      !(await takeSecurityAttempt(`login:${email}`))
    )
      return null;
    const initial = await db.user.findUnique({ where: { email } });
    if (
      !(await bcrypt.compare(password, initial?.passwordHash ?? dummyHash)) ||
      !initial?.isActive
    )
      return null;
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${initial.id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: initial.id },
        include: adminIdentityInclude,
      });
      if (!user.isActive || user.passwordHash !== initial.passwordHash)
        return null;
      const enrollmentOnly = requiresMfa(user) && !user.mfaEnabled;
      if (user.mfaEnabled && !(await consumeMfa(tx, user, token))) return null;
      const now = new Date();
      const session = await tx.adminSession.create({
        data: {
          userId: user.id,
          sessionVersion: user.sessionVersion,
          enrollmentOnly,
          mfaVerifiedAt: user.mfaEnabled ? now : null,
          expiresAt: new Date(
            now.getTime() + (enrollmentOnly ? 600000 : 28800000),
          ),
          userAgent: agent.slice(0, 250),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "security.login",
          entityType: "AdminSession",
          entityId: session.id,
          after: { enrollmentOnly, mfa: user.mfaEnabled },
        },
      });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        adminSessionId: session.id,
        sessionVersion: user.sessionVersion,
        enrollmentOnly,
      };
    });
    if (result) await clearLoginAttempts(email);
    return result;
  });
}
export async function validAdminSession(
  userId: string,
  sessionId: string,
  version: number,
  allowEnrollment = false,
) {
  const row = await db.adminSession.findUnique({
    where: { id: sessionId },
    include: { user: { include: adminIdentityInclude } },
  });
  if (
    !row ||
    row.userId !== userId ||
    row.revokedAt ||
    row.expiresAt <= new Date() ||
    !row.user.isActive ||
    row.sessionVersion !== version ||
    row.user.sessionVersion !== version
  )
    return null;
  if (row.enrollmentOnly) return allowEnrollment ? row : null;
  if (
    (row.user.mfaEnabled || requiresMfa(row.user)) &&
    (!row.user.mfaEnabled || !row.mfaVerifiedAt)
  )
    return null;
  return row;
}
export async function beginMfaEnrollment(
  userId: string,
  password: string,
  issuer: string,
) {
  if (!(await takeSecurityAttempt(`enroll:${userId}`)))
    throw new Error("SECURITY_DENIED");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        !user.isActive ||
        user.mfaEnabled ||
        !(await bcrypt.compare(password, user.passwordHash))
      )
        throw new Error("SECURITY_DENIED");
      const secret = new Secret({ size: 20 }).base32;
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaPendingSecret: seal({ secret, expires: Date.now() + 600000 }),
        },
      });
      return { secret, uri: totpFor(secret, issuer, user.email).toString() };
    }),
  );
}
export async function finishMfaEnrollment(userId: string, token: string) {
  if (!(await takeSecurityAttempt(`enroll-confirm:${userId}`)))
    throw new Error("SECURITY_DENIED");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.isActive || user.mfaEnabled || !user.mfaPendingSecret)
        throw new Error("SECURITY_DENIED");
      const pending = z
        .object({ secret: z.string(), expires: z.number() })
        .parse(unseal(user.mfaPendingSecret));
      const step = matchingStep(pending.secret, token);
      if (pending.expires <= Date.now() || step === null)
        throw new Error("SECURITY_DENIED");
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(12)
          .toString("hex")
          .match(/.{1,6}/g)!
          .join("-"),
      );
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: seal(pending.secret),
          mfaPendingSecret: null,
          mfaLastStep: step,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          codeHash: recoveryHash(userId, code),
        })),
      });
      await tx.adminSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "security.mfa.enabled",
          entityType: "User",
          entityId: userId,
          after: { enabled: true },
        },
      });
      return codes;
    }),
  );
}
export async function requireFreshMfa(
  userId: string,
  password: string,
  token: string,
) {
  if (!(await takeSecurityAttempt(`step-up:${userId}`)))
    throw new Error("SECURITY_DENIED");
  const ok = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isActive || !(await bcrypt.compare(password, user.passwordHash)))
      return false;
    return consumeMfa(tx, user, token, false);
  });
  if (!ok) throw new Error("SECURITY_DENIED");
}
