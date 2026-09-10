import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { seal, unseal } from "@/lib/secure-tokens";
import {
  authenticateAdmin,
  beginMfaEnrollment,
  finishMfaEnrollment,
  validAdminSession,
  totpFor,
  recoveryHash,
  requireFreshMfa,
} from "@/modules/auth/security";
import {
  assertRoleGrant,
  lockSecurity,
  protectLastOwner,
} from "@/modules/access/management";
const password = "SecurityTest123!";
async function fixture(roleKey = "owner") {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  return db.user.create({
    data: {
      name: "Security test",
      email: `security-${randomUUID()}@example.com`,
      passwordHash: await bcrypt.hash(password, 4),
      roles: { create: { roleId: role.id } },
    },
  });
}
async function login(user: { email: string }, token = "") {
  return authenticateAdmin(
    { email: user.email, password, token },
    randomUUID(),
    "test-browser",
  );
}
beforeEach(() => vi.stubEnv("AUTH_SECRET", "phase05-security-test-secret"));
afterEach(() => vi.unstubAllEnvs());
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "phase 05 administrator security",
  () => {
    it("restricts password-only owners to enrollment and revokes setup sessions on activation", async () => {
      const user = await fixture(),
        session = await login(user);
      expect(session?.enrollmentOnly).toBe(true);
      expect(
        await validAdminSession(user.id, session!.adminSessionId, 0),
      ).toBeNull();
      expect(
        await validAdminSession(user.id, session!.adminSessionId, 0, true),
      ).not.toBeNull();
      await expect(
        beginMfaEnrollment(user.id, "wrong password", "Test"),
      ).rejects.toThrow();
      const setup = await beginMfaEnrollment(user.id, password, "Test"),
        code = totpFor(setup.secret).generate();
      const recovery = await finishMfaEnrollment(user.id, code);
      expect(recovery).toHaveLength(10);
      expect(
        await validAdminSession(user.id, session!.adminSessionId, 0, true),
      ).toBeNull();
      const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(saved.mfaSecret).not.toBe(setup.secret);
      expect(unseal(saved.mfaSecret!)).toBe(setup.secret);
      expect(await login(user)).toBeNull();
      expect(await login(user, code)).toBeNull(); // enrollment already consumed this step
      const good = await login(user, recovery[0]);
      expect(good?.enrollmentOnly).toBe(false);
      expect(await login(user, recovery[0])).toBeNull();
      expect(
        await db.mfaRecoveryCode.count({
          where: { userId: user.id, usedAt: { not: null } },
        }),
      ).toBe(1);
    });
    it("consumes a TOTP exactly once under concurrent login and immediately revokes sessions", async () => {
      const user = await fixture(),
        secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      await db.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaSecret: seal(secret) },
      });
      const token = totpFor(secret).generate(),
        results = await Promise.all([login(user, token), login(user, token)]);
      const sessions = results.filter((r) => r !== null);
      expect(sessions).toHaveLength(1);
      const session = sessions[0]!;
      expect(
        await validAdminSession(
          user.id,
          session.adminSessionId,
          session.sessionVersion,
        ),
      ).not.toBeNull();
      await db.adminSession.update({
        where: { id: session.adminSessionId },
        data: { revokedAt: new Date() },
      });
      expect(
        await validAdminSession(
          user.id,
          session.adminSessionId,
          session.sessionVersion,
        ),
      ).toBeNull();
    });
    it("consumes recovery atomically and refuses recovery as restore step-up proof", async () => {
      const user = await fixture(),
        secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        code = "abcdef123456abcdef123456";
      await db.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaSecret: seal(secret) },
      });
      await db.mfaRecoveryCode.create({
        data: { userId: user.id, codeHash: recoveryHash(user.id, code) },
      });
      await expect(requireFreshMfa(user.id, password, code)).rejects.toThrow();
      const results = await Promise.all([login(user, code), login(user, code)]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });
    it("session version, account disablement and enrollment expiry fail closed", async () => {
      const user = await fixture("warehouse"),
        session = await login(user);
      expect(session?.enrollmentOnly).toBe(false);
      await db.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(
        await validAdminSession(user.id, session!.adminSessionId, 0),
      ).toBeNull();
      const newer = await login(user);
      await db.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
      expect(
        await validAdminSession(user.id, newer!.adminSessionId, 1),
      ).toBeNull();
      expect(await login(user)).toBeNull();
      const owner = await fixture();
      const setup = await beginMfaEnrollment(owner.id, password, "Test");
      await db.user.update({
        where: { id: owner.id },
        data: { mfaPendingSecret: seal({ secret: setup.secret, expires: 0 }) },
      });
      await expect(
        finishMfaEnrollment(owner.id, totpFor(setup.secret).generate()),
      ).rejects.toThrow();
    });
    it("throttles password guessing and rejects role escalation by an administrator", async () => {
      const user = await fixture("admin");
      for (let i = 0; i < 10; i++)
        expect(
          await authenticateAdmin(
            { email: user.email, password: "wrong-password", token: "" },
            randomUUID(),
            "test",
          ),
        ).toBeNull();
      expect(await login(user)).toBeNull();
      const ownerRole = await db.role.findUniqueOrThrow({
        where: { key: "owner" },
      });
      await expect(assertRoleGrant(user.id, ownerRole.id)).rejects.toThrow(
        "FORBIDDEN",
      );
      const owner = await fixture();
      await expect(
        assertRoleGrant(owner.id, ownerRole.id, { marketId: "TR" }),
      ).rejects.toThrow("OWNER_SCOPE_REQUIRED");
    });
    it("protects the last active owner under the management lock", async () => {
      // Roll back the temporary fixture changes so seeded owners remain usable.
      await expect(
        db.$transaction(async (tx) => {
          await lockSecurity(tx);
          const owner = await tx.user.findFirstOrThrow({
            where: {
              isActive: true,
              roles: { some: { role: { key: "owner" } } },
            },
          });
          await tx.user.updateMany({
            where: {
              id: { not: owner.id },
              roles: { some: { role: { key: "owner" } } },
            },
            data: { isActive: false },
          });
          await protectLastOwner(tx, owner.id, false, false);
        }),
      ).rejects.toThrow("LAST_OWNER");
    });
  },
);
