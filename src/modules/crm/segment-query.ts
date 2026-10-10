import { Prisma } from "@prisma/client";
import { segmentSchema } from "./contracts";
// Only static identifiers/operators enter SQL. Values are always bound parameters.
const operators = {
  gte: Prisma.sql`>=`,
  lte: Prisma.sql`<=`,
  eq: Prisma.sql`=`,
};
function segmentRules(marketId: string, input: unknown) {
  const definition = segmentSchema.parse(input);
  return definition.rules.map((r) => {
    switch (r.field) {
      case "market":
        return Prisma.sql`${marketId} = ${r.value}`;
      case "locale":
        return Prisma.sql`c.locale = ${r.value}`;
      case "orders":
        return Prisma.sql`coalesce(s.n, 0) ${operators[r.op]} ${r.value}`;
      case "value":
        return Prisma.sql`coalesce(s.value, 0) ${operators[r.op]} ${r.value}::numeric`;
      case "aov":
        return Prisma.sql`coalesce(s.value / nullif(s.n, 0), 0) ${operators[r.op]} ${r.value}::numeric`;
      case "lastOrder":
        return Prisma.sql`s.last ${operators[r.op]} ${new Date(r.value + "T00:00:00Z")}`;
      case "category":
        return Prisma.sql`EXISTS (SELECT 1 FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id JOIN "Variant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE o."customerId"=c.id AND o."marketId"=${marketId} AND o."paidAt" IS NOT NULL AND o.kind='SALE' AND o.status <> 'CANCELLED' AND p."categoryId"=${r.value})`;
      case "tag":
        return Prisma.sql`EXISTS (SELECT 1 FROM "CrmProfile" p WHERE p."customerId"=c.id AND p."marketId"=${marketId} AND ${r.value}=ANY(p.tags))`;
      case "consent":
        return r.value === "UNKNOWN"
          ? Prisma.sql`NOT EXISTS (SELECT 1 FROM "MarketingConsent" mc WHERE mc."customerId"=c.id AND mc."marketId"=${marketId} AND mc.channel=${r.channel})`
          : Prisma.sql`EXISTS (SELECT 1 FROM "MarketingConsent" mc WHERE mc."customerId"=c.id AND mc."marketId"=${marketId} AND mc.channel=${r.channel} AND mc.status=${r.value})`;
    }
  });
}

export function segmentQuery(marketId: string, input: unknown) {
  const rules = segmentRules(marketId, input);
  return Prisma.sql`FROM "Customer" c LEFT JOIN (SELECT "customerId", count(*)::int n, sum("totalAmountUsd") value, max("paidAt") last FROM "Order" WHERE "marketId"=${marketId} AND "paidAt" IS NOT NULL AND kind='SALE' AND status <> 'CANCELLED' GROUP BY "customerId") s ON s."customerId"=c.id
    WHERE c."isActive" AND (c."preferredMarketId"=${marketId}
      OR EXISTS (SELECT 1 FROM "Order" x WHERE x."customerId"=c.id AND x."marketId"=${marketId})
      OR EXISTS (SELECT 1 FROM "Cart" x WHERE x."customerId"=c.id AND x."marketId"=${marketId})
      OR EXISTS (SELECT 1 FROM "Wishlist" x WHERE x."customerId"=c.id AND x."marketId"=${marketId})
      OR EXISTS (SELECT 1 FROM "Review" x WHERE x."customerId"=c.id AND x."marketId"=${marketId})
      OR EXISTS (SELECT 1 FROM "MarketingConsent" x WHERE x."customerId"=c.id AND x."marketId"=${marketId}))
      ${rules.length ? Prisma.sql`AND ${Prisma.join(rules, " AND ")}` : Prisma.empty}`;
}

/** One customer/market relation and one paid-order aggregate for all predicates. */
export function customerSegmentsQuery(
  marketId: string,
  customerId: string,
  segments: readonly { id: string; definition: unknown }[],
) {
  const matches = segments.map((segment) => {
    const rules = segmentRules(marketId, segment.definition);
    return Prisma.sql`CASE WHEN ${rules.length ? Prisma.join(rules, " AND ") : Prisma.sql`TRUE`} THEN ${segment.id}::text ELSE NULL END`;
  });
  return Prisma.sql`SELECT unnest(ARRAY[${Prisma.join(matches)}]::text[]) AS id
    ${segmentQuery(marketId, { version: 1, rules: [] })} AND c.id=${customerId}`;
}
