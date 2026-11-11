import { cache } from "react";
import { db } from "@/lib/db";
import {
  cutoutGeometrySchema,
  cutoutValidationSchema,
  CUTOUT_SLOTS,
  CUTOUT_ANCHORS,
} from "./contracts";
import { imageFingerprint, storeCutoutModels } from "./models";
import { instantPlacement } from "./fitting-rig";
import type { CatalogCutout, Media, Prisma, Product } from "@prisma/client";

type CutoutVariant = {
  id: string;
  productId: string;
  colorId: string;
  product: Pick<Product, "fittingSlot">;
};
type CutoutProfile = CatalogCutout & { media: Media };
type CutoutModel = Awaited<ReturnType<typeof storeCutoutModels>>[number];
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
async function readCurrentCatalogCutout(
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
  return validatedCutout(variant, choices);
}

function validatedCutout<T extends CutoutVariant>(
  variant: T,
  choices: CutoutProfile[],
) {
  const row =
    choices.find((profile) => profile.variantId === variant.id) ??
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
const requestCutout = cache((variantId: string, marketId: string) =>
  readCurrentCatalogCutout(variantId, marketId, db),
);
export function currentCatalogCutout(
  variantId: string,
  marketId: string,
  client: Prisma.TransactionClient = db,
) {
  return client === db
    ? requestCutout(variantId, marketId)
    : readCurrentCatalogCutout(variantId, marketId, client);
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
  instant = false,
) {
  const current = await currentCatalogCutout(variantId, marketId, client);
  if (!current) return null;
  const model = (await storeCutoutModels(client)).find(
    (choice) => choice.id === modelId,
  );
  return placementFor(current, model, instant);
}

/** Resolve profiles together for variants already checked in the scene's market. */
export async function resolveCutoutPlacements(
  variants: CutoutVariant[],
  model: CutoutModel,
  client: Prisma.TransactionClient,
) {
  if (!variants.length)
    return new Map<string, ReturnType<typeof placementFor>>();
  const profiles = await client.catalogCutout.findMany({
    where: {
      productId: {
        in: [...new Set(variants.map(({ productId }) => productId))],
      },
      colorId: { in: [...new Set(variants.map(({ colorId }) => colorId))] },
      deletedAt: null,
      OR: [
        { variantId: { in: variants.map(({ id }) => id) } },
        { variantId: null },
      ],
    },
    include: { media: true },
  });
  return new Map(
    variants.map((variant) => {
      const choices = profiles.filter(
        (profile) =>
          profile.productId === variant.productId &&
          profile.colorId === variant.colorId,
      );
      const current = validatedCutout(variant, choices);
      return [variant.id, current ? placementFor(current, model) : null];
    }),
  );
}

function placementFor(
  current: NonNullable<ReturnType<typeof validatedCutout>>,
  model: CutoutModel | undefined,
  instant = false,
) {
  const modelId = model?.id;
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
    geometry: instant
      ? instantPlacement(placement, current.row, {
          id: model.id,
          mediaId: model.mediaId,
          width: model.image.width,
          height: model.image.height,
        })
      : placement,
    model: {
      id: model.id,
      kind: model.kind,
      label: model.label,
      media: cutoutPublicImage(model.image),
    },
  };
}

/** Public, already validated geometry for immediate client presentation only.
 * Mutation endpoints always resolve current references again; this is no authority to save/buy.
 */
export async function publicCutoutPlacements(
  variantId: string,
  marketId: string,
) {
  const current = await currentCatalogCutout(variantId, marketId);
  if (!current) return [];
  return (await storeCutoutModels()).flatMap((model) => {
    const layer = placementFor(current, model, true);
    return layer ? [layer] : [];
  });
}
