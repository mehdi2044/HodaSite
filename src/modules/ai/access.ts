import { type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  evaluateAccess,
  ForbiddenError,
  UnauthorizedError,
  type Scope,
} from "@/modules/access";
export async function sessionActor() {
  const { auth } = await import("@/modules/auth");
  const id = (await auth())?.user?.id;
  if (!id) throw new UnauthorizedError();
  return id;
}
export async function aiAccess(
  actor: string,
  permission: string,
  scope: Scope = {},
  tx: Prisma.TransactionClient = db,
) {
  const user = await tx.user.findUnique({
    where: { id: actor },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!evaluateAccess(user, permission, scope))
    throw new ForbiddenError(permission, scope);
}
