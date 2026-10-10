import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import {
  assertCan,
  can,
  UnauthorizedError,
  ForbiddenError,
} from "@/modules/access";
import { currentCustomer } from "@/modules/customers";
import { id } from "./contracts";

export async function admin(permission: string, marketId: string) {
  id.parse(marketId);
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, permission, { marketId });
  return session.user.id;
}
export async function customer() {
  const row = await currentCustomer();
  if (!row) throw new UnauthorizedError();
  return row;
}
export async function visibleCrmMarkets(permission = "crm.customer.view") {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const rows = await db.market.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const allowed = await Promise.all(
    rows.map((m) => can(session.user.id, permission, { marketId: m.id })),
  );
  return rows.filter((_, i) => allowed[i]);
}
export { membership, requireMember } from "./membership";
export async function activeMarket(marketId: string) {
  id.parse(marketId);
  if (!(await db.market.findFirst({ where: { id: marketId, isActive: true } })))
    throw new ForbiddenError("crm.customer.view", { marketId });
}
