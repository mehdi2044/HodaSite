import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import {
  opaqueToken,
  signValue,
  equalSecret,
  tokenHash,
} from "@/lib/secure-tokens";
import { queueEmail, type NotificationLocale } from "@/modules/notifications";

export async function requestCustomerOtp(
  rawEmail: string,
  locale: NotificationLocale,
  ip: string,
) {
  const email = z.email().max(254).parse(rawEmail.trim().toLowerCase());
  const code = String(randomInt(0, 1000000)).padStart(6, "0"),
    link = opaqueToken(),
    now = new Date();
  return withMutation(() =>
    db.$transaction(async (tx) => {
      for (const [id, limit] of [
        [tokenHash(`email:${email}`), 5],
        [tokenHash(`ip:${ip}`), 30],
      ] as const) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
        const bucket = await tx.authThrottle.findUnique({ where: { id } });
        const fresh =
          !bucket || now.getTime() - bucket.windowStart.getTime() >= 15 * 60000;
        if (!fresh && bucket.attempts >= limit) return { ok: false };
        await tx.authThrottle.upsert({
          where: { id },
          create: { id, attempts: 1, windowStart: now },
          update: fresh
            ? { attempts: 1, windowStart: now }
            : { attempts: { increment: 1 } },
        });
      }
      await tx.authOtp.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: now },
      });
      const otp = await tx.authOtp.create({
        data: {
          email,
          codeHash: signValue(`${email}:${code}`),
          linkHash: tokenHash(link),
          expiresAt: new Date(now.getTime() + 600000),
        },
      });
      const origin = process.env.APP_URL ?? process.env.AUTH_URL;
      if (!origin) throw new Error("APP_URL required for customer login");
      const loginUrl = new URL(`/${locale}/account/login`, origin);
      loginUrl.hash = new URLSearchParams({
        challenge: otp.id,
        token: link,
      }).toString();
      await queueEmail(tx, "auth.otp", email, locale, {
        code,
        expiresMinutes: "10",
        loginUrl: loginUrl.toString(),
      });
      return { ok: true, challengeId: otp.id };
    }),
  );
}
export async function verifyCustomerOtp(raw: unknown) {
  const parsed = z
    .object({
      challengeId: z.string().min(1).max(100),
      code: z.string().max(100).optional(),
      token: z.string().max(100).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return null;
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const { challengeId, code, token } = parsed.data;
      await tx.$queryRaw`SELECT id FROM "AuthOtp" WHERE id=${challengeId} FOR UPDATE`;
      const otp = await tx.authOtp.findUnique({ where: { id: challengeId } }),
        now = new Date();
      if (!otp || otp.usedAt || otp.attempts >= 5 || otp.expiresAt <= now)
        return null;
      await tx.authOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const valid = token
        ? equalSecret(tokenHash(token), otp.linkHash)
        : /^\d{6}$/.test(code ?? "") &&
          equalSecret(signValue(`${otp.email}:${code}`), otp.codeHash);
      if (!valid) return null;
      await tx.authOtp.update({ where: { id: otp.id }, data: { usedAt: now } });
      const existing = await tx.customer.findUnique({
        where: { email: otp.email },
      });
      if (existing && !existing.isActive) return null;
      return tx.customer.upsert({
        where: { email: otp.email },
        create: { email: otp.email, isGuest: false },
        update: { isGuest: false },
      });
    }),
  );
}
