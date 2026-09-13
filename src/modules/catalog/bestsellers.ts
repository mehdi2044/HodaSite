import { db } from "@/lib/db";
import { catalogProductInclude } from "./queries";

/** All-time paid SALE quantities in this market, less physically received returns.
 * Cancelled/fully refunded orders and exchange replacements do not count.
 * This is merchandising popularity, not a financial revenue report.
 */
export async function listBestsellers(marketId: string, limit = 4) {
  const take = Math.min(12, Math.max(1, Math.trunc(limit)));
  const ranked = await db.$queryRaw<Array<{ id: string }>>`
    SELECT p.id
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    JOIN "Variant" v ON v.id = i."variantId"
    JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN LATERAL (
      SELECT SUM(ri.quantity) AS quantity
      FROM "ReturnItem" ri
      JOIN "ReturnRequest" rr ON rr.id = ri."returnRequestId"
      WHERE ri."orderItemId" = i.id AND rr."receivedAt" IS NOT NULL
    ) returned ON true
    WHERE o."marketId" = ${marketId} AND o."paidAt" IS NOT NULL
      AND o.kind = 'SALE' AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      AND p."deletedAt" IS NULL AND p.status = 'ACTIVE'
      AND ${marketId} = ANY(p."marketIds")
    GROUP BY p.id
    HAVING SUM(GREATEST(i.quantity - COALESCE(returned.quantity, 0), 0)) > 0
    ORDER BY SUM(GREATEST(i.quantity - COALESCE(returned.quantity, 0), 0)) DESC, p.id ASC
    LIMIT ${take}
  `;
  const products = await db.product.findMany({
    where: {
      id: { in: ranked.map((row) => row.id) },
      deletedAt: null,
      status: "ACTIVE",
      marketIds: { has: marketId },
    },
    include: catalogProductInclude,
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  return ranked.flatMap(({ id }) => (byId.has(id) ? [byId.get(id)!] : []));
}
