import { z } from "zod";
import { db } from "@/lib/db";
import { catalogProductInclude, catalogText } from "@/modules/catalog";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { placementSchema } from "./contracts";
import { inspectCutoutImage } from "./alpha";
import { imageFingerprint, storeCutoutModels } from "./models";
import { cutoutPublicImage } from "./resolve";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const cutoutPreviewInputSchema = z
  .object({
    productId: id,
    colorId: id,
    variantId: id.nullable(),
    mediaId: id,
    marketId: id,
    locale: z.enum(["fa", "tr", "en"]),
    geometry: z
      .object({
        version: z.literal(1),
        models: z.array(placementSchema).max(40),
      })
      .strict(),
  })
  .strict();
export async function previewCatalogCutout(raw: unknown) {
  const input = cutoutPreviewInputSchema.parse(raw);
  const market = await db.market.findFirst({
    where: {
      id: input.marketId,
      isActive: true,
      enabledLocales: { has: input.locale },
    },
  });
  if (!market) throw new z.ZodError([]);
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      deletedAt: null,
      coinPackCoins: null,
      marketIds: { has: market.id },
      category: { deletedAt: null },
    },
    include: catalogProductInclude,
  });
  const media = await db.media.findFirst({
    where: {
      id: input.mediaId,
      kind: "image",
      status: "READY",
      deletedAt: null,
      mime: { in: ["image/png", "image/webp", "image/avif"] },
    },
  });
  if (!product || !media) throw new z.ZodError([]);
  const variants = product.variants.filter(
    (v) =>
      v.colorId === input.colorId &&
      !v.color.deletedAt &&
      !v.size.deletedAt &&
      (!input.variantId || v.id === input.variantId),
  );
  if (!variants.length) throw new z.ZodError([]);
  const models = await storeCutoutModels();
  if (
    new Set(input.geometry.models.map((m) => m.modelId)).size !==
      input.geometry.models.length ||
    input.geometry.models.some((g) => !models.some((m) => m.id === g.modelId))
  )
    throw new z.ZodError([]);
  let transparent = false;
  try {
    const checked = await inspectCutoutImage(media.id);
    transparent = checked.imageFingerprint === imageFingerprint(media);
  } catch {
    /* An opaque photo has an honest non-composition fallback. */
  }
  const prices = await getVariantDisplayPrices(
    [{ ...product, variants }],
    market,
  ).catch(() => null);
  return {
    image: cutoutPublicImage(media),
    imageFingerprint: imageFingerprint(media),
    transparent,
    currency: market.currency,
    title: catalogText(product.titleI18n, input.locale),
    color: catalogText(variants[0].color.nameI18n, input.locale),
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size.value,
      amount: prices?.get(v.id)?.amount.toString() ?? null,
      available: Math.max(
        0,
        v.stockItems.reduce(
          (total, row) => total + row.onHand - row.reserved,
          0,
        ),
      ),
    })),
    models: models.map((m) => ({
      id: m.id,
      kind: m.kind,
      label: catalogText(m.label, input.locale),
      image: cutoutPublicImage(m.image),
      fingerprint: m.fingerprint,
    })),
  };
}
export type CutoutPreview = Awaited<ReturnType<typeof previewCatalogCutout>>;
