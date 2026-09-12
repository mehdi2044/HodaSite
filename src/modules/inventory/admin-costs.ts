import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
/** Global inventory cost read. Do not accept client-supplied authorization/scope. */
export async function adminInventoryCosts(userId: string) {
  await assertCan(userId, "pricing.cost.view");
  return db.lot.findMany({
    include: { variant: true, warehouse: true },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });
}
