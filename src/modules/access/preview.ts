import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, evaluateAccess, PERMISSIONS } from "./index";
import { scopeSchema, validateScope } from "./management";
const inputSchema = z
  .object({
    roleId: z.string().min(1).max(100),
    grant: scopeSchema,
    target: scopeSchema,
  })
  .strict();
/** Read-only role simulation. Never writes session state or grants permissions. */
export async function previewRole(actorId: string, raw: unknown) {
  await assertCan(actorId, "security.role.manage");
  const input = inputSchema.parse(raw);
  await validateScope(input.grant);
  await validateScope(input.target);
  const role = await db.role.findUniqueOrThrow({
    where: { id: input.roleId },
    include: { permissions: true },
  });
  const subject = {
    isActive: true,
    overrides: [],
    roles: [{ scope: input.grant, role }],
  };
  return PERMISSIONS.map((permission) => ({
    permission,
    allowed: evaluateAccess(subject, permission, input.target),
  }));
}
