import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/modules/access";
import { id } from "./contracts";
export function membership(marketId: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { preferredMarketId: marketId },
      { orders: { some: { marketId } } },
      { carts: { some: { marketId } } },
      { wishlists: { some: { marketId } } },
      { reviews: { some: { marketId } } },
      { consents: { some: { marketId } } },
    ],
  };
}
export async function requireMember(
  customerId: string,
  marketId: string,
  tx: Prisma.TransactionClient = db,
) {
  id.parse(customerId);
  if (
    !(await tx.customer.findFirst({
      where: { id: customerId, ...membership(marketId) },
      select: { id: true },
    }))
  )
    throw new ForbiddenError("crm.customer.view", { marketId });
}
