import { Prisma } from "@prisma/client";
import { z } from "zod";
import { variantInputSchema } from "./validation";
/** Preserve variant identities: stock, lots and order history keep their references. */
export async function persistVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: z.infer<typeof variantInputSchema>[],
) {
  const existing = await tx.variant.findMany({ where: { productId } }),
    ids = variants.flatMap((v) => (v.id ? [v.id] : []));
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !existing.some((v) => v.id === id))
  )
    throw new z.ZodError([]);
  await tx.variant.updateMany({
    where: { productId, id: { notIn: ids } },
    data: { isActive: false },
  });
  for (const v of variants) {
    const old = existing.find((o) => o.id === v.id);
    if (
      old &&
      (old.colorId !== v.colorId ||
        old.sizeId !== v.sizeId ||
        old.sku !== v.sku)
    ) {
      const [stock, order] = await Promise.all([
        tx.stockItem.count({ where: { variantId: old.id } }),
        tx.orderItem.count({ where: { variantId: old.id } }),
      ]);
      if (stock || order) throw new z.ZodError([]);
    }
    const data = {
      productId,
      sku: v.sku,
      barcode: v.barcode || null,
      colorId: v.colorId,
      sizeId: v.sizeId,
      priceOverrideUsd: v.priceOverrideUsd
        ? new Prisma.Decimal(v.priceOverrideUsd)
        : null,
      weightGrams: v.weightGrams ?? null,
      isActive: v.isActive,
    };
    const row = old
      ? await tx.variant.update({ where: { id: old.id }, data })
      : await tx.variant.create({ data });
    await tx.variantMedia.deleteMany({ where: { variantId: row.id } });
    if (v.mediaIds.length)
      await tx.variantMedia.createMany({
        data: v.mediaIds.map((mediaId, sortOrder) => ({
          variantId: row.id,
          mediaId,
          sortOrder,
        })),
      });
  }
}
