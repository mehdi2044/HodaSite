import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audiences, colors, occasions, seasons, styles } from "./contracts";
import { publishedEntries } from "./queries";

export const galleryFilters = z.object({
  audience: z.enum(audiences).optional().catch(undefined),
  season: z.enum(seasons).optional().catch(undefined),
  occasion: z.enum(occasions).optional().catch(undefined),
  style: z.enum(styles).optional().catch(undefined),
  color: z.enum(colors).optional().catch(undefined),
  min: z
    .string()
    .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
    .optional()
    .catch(undefined),
  max: z
    .string()
    .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
    .optional()
    .catch(undefined),
  sort: z.enum(["newest", "popular", "featured"]).catch("newest"),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});
export type GalleryFilters = z.infer<typeof galleryFilters>;
export type PublicLook = Awaited<ReturnType<typeof listLooks>>[number];

export function withinPrice(
  amount: string | null,
  filters: Pick<GalleryFilters, "min" | "max">,
) {
  if (!filters.min && !filters.max) return true;
  return (
    amount !== null &&
    (!filters.min || new Decimal(amount).gte(filters.min)) &&
    (!filters.max || new Decimal(amount).lte(filters.max))
  );
}

export async function listLooks(marketId: string, filters?: GalleryFilters) {
  const entries = (await publishedEntries("LOOK", marketId))
    .flatMap((entry) =>
      entry.body.kind === "LOOK" ? [{ ...entry, body: entry.body }] : [],
    )
    .filter(
      ({ body }) =>
        !filters ||
        ((!filters.audience || body.audience === filters.audience) &&
          (!filters.season || body.season === filters.season) &&
          (!filters.occasion || body.occasion === filters.occasion) &&
          (!filters.style || body.style === filters.style) &&
          (!filters.color || body.color === filters.color)),
    );
  entries.sort(
    (a, b) =>
      b.revision.visibleFrom!.getTime() - a.revision.visibleFrom!.getTime(),
  );
  if (filters?.sort === "featured")
    entries.sort((a, b) => Number(b.body.featured) - Number(a.body.featured));
  if (filters?.sort === "popular" && entries.length) {
    const productIds = [
      ...new Set(
        entries.flatMap((entry) =>
          entry.body.items.map((item) => item.productId),
        ),
      ),
    ];
    const sales = await db.$queryRaw<{ productId: string; units: bigint }[]>`
      SELECT v."productId", SUM(i.quantity) AS units FROM "OrderItem" i
      JOIN "Variant" v ON v.id = i."variantId" JOIN "Order" o ON o.id = i."orderId"
      WHERE o."marketId" = ${marketId} AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED')
        AND i."exchangeOfOrderItemId" IS NULL
        AND v."productId" IN (${Prisma.join(productIds)})
      GROUP BY v."productId"`;
    const counts = new Map(
      sales.map(({ productId, units }) => [productId, units]),
    );
    const rank = (entry: (typeof entries)[number]) =>
      entry.body.items.reduce(
        (sum, item) => sum + (counts.get(item.productId) ?? 0n),
        0n,
      );
    entries.sort((a, b) =>
      rank(a) === rank(b) ? 0 : rank(a) > rank(b) ? -1 : 1,
    );
  }
  return entries;
}
