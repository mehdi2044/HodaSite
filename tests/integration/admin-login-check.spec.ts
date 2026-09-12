import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { seal, signValue } from "@/lib/secure-tokens";
import { inspectAdminLogin } from "../../scripts/lib/admin-login-check";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "readonly operator login diagnostic",
  () => {
    it("detects persisted password drift, MFA and throttling without leaking secrets or changing state", async () => {
      const email = `login-check-${randomUUID()}@example.com`,
        password = "SavedPassword123!",
        secret = "JBSWY3DPEHPK3PXP";
      const user = await db.user.create({
        data: {
          email,
          name: "Diagnostic test",
          passwordHash: await bcrypt.hash(password, 4),
          mfaEnabled: true,
          mfaSecret: seal(secret),
        },
      });
      const id = signValue(`admin-limit:login:${email}`);
      await db.authThrottle.create({
        data: { id, attempts: 10, windowStart: new Date() },
      });
      const before = await db.authThrottle.findUniqueOrThrow({ where: { id } });
      const report = await inspectAdminLogin(db, undefined, {
        email,
        password: "ChangedEnv123!",
      });
      expect(report).toMatchObject({
        adminAccountFound: true,
        accountActive: true,
        configuredPasswordMatches: false,
        mfaEnabled: true,
        mfaSecretReadable: true,
      });
      expect(report.accountRateLimitWaitSeconds).toBeGreaterThan(0);
      expect(
        (await inspectAdminLogin(db, email, { email, password }))
          .configuredPasswordMatches,
      ).toBe(true);
      expect(await db.authThrottle.findUnique({ where: { id } })).toEqual(
        before,
      );
      expect(await db.adminSession.count({ where: { userId: user.id } })).toBe(
        0,
      );
      const output = JSON.stringify(report);
      for (const value of [
        email,
        password,
        secret,
        user.passwordHash,
        user.mfaSecret!,
      ])
        expect(output).not.toContain(value);
    });
    it("distinguishes customer-only and missing accounts", async () => {
      const email = `customer-check-${randomUUID()}@example.com`;
      await db.customer.create({ data: { email } });
      expect(await inspectAdminLogin(db, email)).toMatchObject({
        adminAccountFound: false,
        customerAccountOnly: true,
        configuredPasswordMatches: null,
      });
      expect(
        await inspectAdminLogin(db, `missing-${randomUUID()}@example.com`),
      ).toMatchObject({ adminAccountFound: false, customerAccountOnly: false });
    });
    it("identifies stored email case and unreadable MFA configuration", async () => {
      const email = `CASE-${randomUUID()}@example.com`;
      await db.user.create({
        data: {
          email,
          name: "Case test",
          passwordHash: await bcrypt.hash("Example123!", 4),
          mfaEnabled: true,
          mfaSecret: "unreadable-fixture",
        },
      });
      expect(await inspectAdminLogin(db, email)).toMatchObject({
        adminAccountFound: true,
        storedEmailCaseMismatch: true,
        mfaEnabled: true,
        mfaSecretReadable: false,
      });
    });
  },
);
