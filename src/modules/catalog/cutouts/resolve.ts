import { db } from "@/lib/db";
import {
  cutoutGeometrySchema,
  cutoutValidationSchema,
  CUTOUT_SLOTS,
  CUTOUT_ANCHORS,
} from "./contracts";
import { imageFingerprint, storeCutoutModels } from "./models";
import type { Media, Prisma } from "@prisma/client";
export function cutoutPublicImage(media: Media) {
  return {
    url: media.url,
    width: media.width,
    height: media.height,
    variants: media.variants,
    blurDataUrl: media.blurDataUrl,
    altI18n: media.altI18n,
  };
}
/** Select the actual color/size identity before choosing an optional override. */
export async function currentCatalogCutout(
  variantId: string,
  marketId: string,
  client: Prisma.TransactionClient = db,
) {
  const variant = await client.variant.findFirst({
    where: {
      id: variantId,
      isActive: true,
      color: { deletedAt: null },
      size: { deletedAt: null },
      product: {
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { has: marketId },
        category: { deletedAt: null },
      },
    },
    include: { product: true },
  });
  if (!variant) return null;
  const choices = await client.catalogCutout.findMany({
    where: {
      productId: variant.productId,
      colorId: variant.colorId,
      deletedAt: null,
      OR: [{ variantId }, { variantId: null }],
    },
    include: { media: true },
  });
  const row =
    choices.find((profile) => profile.variantId === variantId) ??
    choices.find((profile) => profile.variantId === null);
  if (!row) return null;
  const geometry = cutoutGeometrySchema.safeParse(row.geometry),
    validation = cutoutValidationSchema.safeParse(row.validation);
  if (
    !geometry.success ||
    !validation.success ||
    row.slot !== variant.product.fittingSlot ||
    !(CUTOUT_SLOTS as readonly string[]).includes(row.slot) ||
    (row.slot === "ACCESSORY"
      ? !(CUTOUT_ANCHORS as readonly string[]).includes(row.anchor ?? "")
      : row.anchor !== null) ||
    row.media.kind !== "image" ||
    row.media.status !== "READY" ||
    row.media.deletedAt ||
    imageFingerprint(row.media) !== validation.data.imageFingerprint
  )
    return null;
  return { row, geometry: geometry.data, validation: validation.data, variant };
}
export async function publicCatalogCutout(variantId: string, marketId: string) {
  const current = await currentCatalogCutout(variantId, marketId);
  if (!current) return null;
  const { row } = current;
  return {
    id: row.id,
    version: row.version,
    media: cutoutPublicImage(row.media),
    productId: row.productId,
    colorId: row.colorId,
    slot: row.slot,
    anchor: row.anchor,
  };
}
export async function resolveCutoutPlacement(
  variantId: string,
  marketId: string,
  modelId: string,
  client: Prisma.TransactionClient = db,
) {
  const current = await currentCatalogCutout(variantId, marketId, client);
  if (!current) return null;
  const model = (await storeCutoutModels(client)).find(
    (choice) => choice.id === modelId,
  );
  const placement = current.geometry.models.find(
    (item) => item.modelId === modelId,
  );
  if (
    !model ||
    !placement ||
    !current.validation.models.some(
      (item) =>
        item.modelId === modelId && item.fingerprint === model.fingerprint,
    )
  )
    return null;
  return {
    profileId: current.row.id,
    profileVersion: current.row.version,
    mediaId: current.row.mediaId,
    productId: current.variant.productId,
    colorId: current.variant.colorId,
    variantId: current.variant.id,
    slot: current.row.slot as (typeof CUTOUT_SLOTS)[number],
    anchor: current.row.anchor as (typeof CUTOUT_ANCHORS)[number] | null,
    media: cutoutPublicImage(current.row.media),
    geometry: placement,
    model: {
      id: model.id,
      kind: model.kind,
      label: model.label,
      media: cutoutPublicImage(model.image),
    },
  };
}
