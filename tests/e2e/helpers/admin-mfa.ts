import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { seal, signValue } from "../../../src/lib/secure-tokens";
const db = new PrismaClient();
/** Test fixture only: persist an enabled authenticator and mint a unique recovery
 * code for each existing login test. Authentication itself still goes through
 * the real password + MFA Credentials flow. No application bypass is added.
 * Dedicated MFA specs exercise enrollment, real TOTP, reuse denial and revocation.
 */
export async function fillAdminMfa(page: Page) {
  const email = await page.locator('[name="email"]').inputValue();
  const user = await db.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });
  if (
    !user?.isActive ||
    !user.roles.some((r) => ["owner", "admin"].includes(r.role.key))
  )
    return;
  if (!user.mfaEnabled)
    await db.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecret: seal("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"),
      },
    });
  const code = randomBytes(12).toString("hex");
  await db.mfaRecoveryCode.create({
    data: {
      userId: user.id,
      codeHash: signValue(`admin-recovery:${user.id}:${code}`),
    },
  });
  await page.locator('[name="token"]').fill(code);
}
