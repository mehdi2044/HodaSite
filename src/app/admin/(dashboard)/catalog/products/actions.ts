"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  productInputSchema,
  productSearchText,
  slugsAreUnique,
} from "@/modules/catalog";

export async function saveProduct(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const status = String(data.get("status") || "DRAFT");
    const requestedId = optional(data, "id");
    await assertCan(
      session.user.id,
      requestedId ? "catalog.product.edit" : "catalog.product.create",
    );
    if (status === "ACTIVE")
      await assertCan(session.user.id, "catalog.product.publish");
    const input = productInputSchema.parse({
      id: requestedId,
      titleI18n: localized(data, "title"),
      descriptionI18n: localized(data, "description"),
      slugI18n: localized(data, "slug"),
      careI18n: localized(data, "care"),
      seoTitleI18n: localized(data, "seoTitle"),
      seoDescriptionI18n: localized(data, "seoDescription"),
      seoOgMediaId: optional(data, "seoOgMediaId"),
      brandId: optional(data, "brandId"),
      categoryId: String(data.get("categoryId") || ""),
      collectionIds: data.getAll("collectionIds").map(String),
      gender: String(data.get("gender") || "UNISEX"),
      material: optional(data, "material"),
      fit: optional(data, "fit"),
      season: optional(data, "season"),
      originCountry: optional(data, "originCountry").toUpperCase(),
      tags: splitList(data.get("tags")),
      status,
      basePriceAmount: String(data.get("basePriceAmount") || ""),
      compareAtPriceAmount: optional(data, "compareAtPriceAmount"),
      defaultPurchaseCostAmount: optional(data, "defaultPurchaseCostAmount"),
      defaultPurchaseCostCurrency:
        optional(data, "defaultPurchaseCostCurrency") || undefined,
      weightGrams: Number(data.get("weightGrams") || 0),
      marketIds: data.getAll("marketIds").map(String),
      mediaIds: parseJson(data.get("mediaIds"), []),
      variants: parseJson(data.get("variants"), []),
      attributes: parseJson(data.get("attributes"), []),
    });

    const current = input.id
      ? await db.product.findFirst({ where: { id: input.id, deletedAt: null } })
      : null;
    if (input.id && !current) throw new z.ZodError([]);
    if (current?.status === "ACTIVE" && input.status !== "ACTIVE")
      await assertCan(session.user.id, "catalog.product.publish");

    const existingSlugs = await db.product.findMany({
      where: {
        deletedAt: null,
        ...(input.id ? { id: { not: input.id } } : {}),
      },
      select: { slugI18n: true },
    });
    if (
      !slugsAreUnique(
        input.slugI18n,
        existingSlugs.map((row) => row.slugI18n as Record<string, string>),
      )
    )
      throw new z.ZodError([]);

    await validateReferences(input);
    const saved = await withMutation(() =>
      db.$transaction(async (tx) => {
        const scalar = {
          slugI18n: input.slugI18n,
          titleI18n: input.titleI18n,
          descriptionI18n: input.descriptionI18n,
          brandId: input.brandId || null,
          categoryId: input.categoryId,
          gender: input.gender,
          material: input.material || null,
          fit: input.fit || null,
          season: input.season || null,
          careI18n: input.careI18n,
          originCountry: input.originCountry || null,
          tags: input.tags,
          status: input.status,
          basePriceAmount: new Prisma.Decimal(input.basePriceAmount),
          basePriceCurrency: "USD",
          compareAtPriceAmount: input.compareAtPriceAmount
            ? new Prisma.Decimal(input.compareAtPriceAmount)
            : null,
          defaultPurchaseCostAmount: input.defaultPurchaseCostAmount
            ? new Prisma.Decimal(input.defaultPurchaseCostAmount)
            : null,
          defaultPurchaseCostCurrency: input.defaultPurchaseCostAmount
            ? input.defaultPurchaseCostCurrency
            : null,
          weightGrams: input.weightGrams,
          seoI18n: {
            title: input.seoTitleI18n,
            description: input.seoDescriptionI18n,
            ogMediaId: input.seoOgMediaId || null,
          },
          marketIds: input.marketIds,
          searchText: productSearchText(input),
        } satisfies Prisma.ProductUncheckedUpdateInput;
        const product = input.id
          ? await tx.product.update({
              where: { id: input.id },
              data: {
                ...scalar,
                collections: { set: input.collectionIds.map((id) => ({ id })) },
              },
            })
          : await tx.product.create({
              data: {
                ...scalar,
                collections: {
                  connect: input.collectionIds.map((id) => ({ id })),
                },
              },
            });
        await tx.variant.deleteMany({ where: { productId: product.id } });
        await tx.productMedia.deleteMany({ where: { productId: product.id } });
        await tx.productAttribute.deleteMany({
          where: { productId: product.id },
        });
        for (const variant of input.variants) {
          const created = await tx.variant.create({
            data: {
              productId: product.id,
              sku: variant.sku,
              barcode: variant.barcode || null,
              colorId: variant.colorId,
              sizeId: variant.sizeId,
              priceOverrideUsd: variant.priceOverrideUsd
                ? new Prisma.Decimal(variant.priceOverrideUsd)
                : null,
              weightGrams: variant.weightGrams ?? null,
              isActive: variant.isActive,
            },
          });
          if (variant.mediaIds.length)
            await tx.variantMedia.createMany({
              data: variant.mediaIds.map((mediaId, sortOrder) => ({
                variantId: created.id,
                mediaId,
                sortOrder,
              })),
            });
        }
        if (input.mediaIds.length)
          await tx.productMedia.createMany({
            data: input.mediaIds.map((mediaId, sortOrder) => ({
              productId: product.id,
              mediaId,
              sortOrder,
            })),
          });
        if (input.attributes.length)
          await tx.productAttribute.createMany({
            data: input.attributes.map((attribute) => ({
              productId: product.id,
              key: attribute.key,
              valueI18n: attribute.valueI18n,
            })),
          });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: input.id
              ? "catalog.product.update"
              : "catalog.product.create",
            entityType: "Product",
            entityId: product.id,
            before: current as object | undefined,
            after: {
              status: product.status,
              basePriceAmount: product.basePriceAmount.toString(),
            },
          },
        });
        return product;
      }),
    );
    revalidateCatalog(saved.slugI18n, current?.slugI18n);
  });
}

export async function setProductStatus(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const parsed = z
      .object({
        ids: z.array(z.string()).min(1).max(100),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
      })
      .parse({
        ids: data.getAll("ids").map(String),
        status: data.get("status"),
      });
    await assertCan(session.user.id, "catalog.product.edit");
    const hasActiveProduct = await db.product.count({
      where: { id: { in: parsed.ids }, deletedAt: null, status: "ACTIVE" },
    });
    if (parsed.status === "ACTIVE" || hasActiveProduct > 0)
      await assertCan(session.user.id, "catalog.product.publish");
    await withMutation(() =>
      db.$transaction(async (tx) => {
        await tx.product.updateMany({
          where: { id: { in: parsed.ids }, deletedAt: null },
          data: { status: parsed.status },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "catalog.product.bulk-status",
            entityType: "Product",
            entityId: parsed.ids.join(","),
            after: { status: parsed.status },
          },
        });
      }),
    );
    revalidateCatalog();
  });
}

export async function setProductDeleted(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "catalog.product.edit");
    const id = z.string().min(1).parse(data.get("id"));
    const before = await db.product.findUniqueOrThrow({ where: { id } });
    if (before.status === "ACTIVE")
      await assertCan(session.user.id, "catalog.product.publish");
    await withMutation(() =>
      db.$transaction([
        db.product.update({
          where: { id },
          data: { deletedAt: new Date(), status: "ARCHIVED" },
        }),
        db.auditLog.create({
          data: {
            userId: session.user.id,
            action: "catalog.product.delete",
            entityType: "Product",
            entityId: id,
            before: before as object,
          },
        }),
      ]),
    );
    revalidateCatalog(before.slugI18n);
  });
}

export async function quickEditProduct(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const input = z
      .object({
        id: z.string().min(1),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
        basePriceAmount: z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/),
      })
      .parse({
        id: data.get("id"),
        status: data.get("status"),
        basePriceAmount: data.get("basePriceAmount"),
      });
    await assertCan(session.user.id, "catalog.product.edit");
    const before = await db.product.findFirstOrThrow({
      where: { id: input.id, deletedAt: null },
    });
    if (input.status === "ACTIVE" || before.status === "ACTIVE")
      await assertCan(session.user.id, "catalog.product.publish");
    await withMutation(() =>
      db.$transaction([
        db.product.update({
          where: { id: input.id },
          data: {
            status: input.status,
            basePriceAmount: new Prisma.Decimal(input.basePriceAmount),
          },
        }),
        db.auditLog.create({
          data: {
            userId: session.user.id,
            action: "catalog.product.quick-edit",
            entityType: "Product",
            entityId: input.id,
            before: {
              status: before.status,
              basePriceAmount: before.basePriceAmount.toString(),
            },
            after: input,
          },
        }),
      ]),
    );
    revalidateCatalog(before.slugI18n);
  });
}

export async function duplicateProduct(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "catalog.product.create");
    const id = z.string().min(1).parse(data.get("id"));
    const source = await db.product.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        collections: true,
        variants: { include: { media: true } },
        media: true,
        attributes: true,
      },
    });
    const suffix = Date.now().toString(36);
    const copy = await withMutation(() =>
      db.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            slugI18n: suffixLocalized(source.slugI18n, suffix),
            titleI18n: suffixLocalized(source.titleI18n, "copy"),
            descriptionI18n: source.descriptionI18n as Prisma.InputJsonValue,
            brandId: source.brandId,
            categoryId: source.categoryId,
            collections: {
              connect: source.collections.map(({ id: collectionId }) => ({
                id: collectionId,
              })),
            },
            gender: source.gender,
            material: source.material,
            fit: source.fit,
            season: source.season,
            careI18n: source.careI18n as Prisma.InputJsonValue,
            originCountry: source.originCountry,
            tags: source.tags,
            status: "DRAFT",
            basePriceAmount: source.basePriceAmount,
            basePriceCurrency: source.basePriceCurrency,
            compareAtPriceAmount: source.compareAtPriceAmount,
            defaultPurchaseCostAmount: source.defaultPurchaseCostAmount,
            defaultPurchaseCostCurrency: source.defaultPurchaseCostCurrency,
            weightGrams: source.weightGrams,
            seoI18n: source.seoI18n as Prisma.InputJsonValue,
            marketIds: source.marketIds,
            searchText: `${source.searchText} copy`,
          },
        });
        if (source.media.length)
          await tx.productMedia.createMany({
            data: source.media.map((item) => ({
              productId: created.id,
              mediaId: item.mediaId,
              sortOrder: item.sortOrder,
            })),
          });
        if (source.attributes.length)
          await tx.productAttribute.createMany({
            data: source.attributes.map((item) => ({
              productId: created.id,
              key: item.key,
              valueI18n: item.valueI18n as Prisma.InputJsonValue,
            })),
          });
        for (const variant of source.variants) {
          const next = await tx.variant.create({
            data: {
              productId: created.id,
              sku: `${variant.sku}-COPY-${suffix}`.toUpperCase(),
              barcode: null,
              colorId: variant.colorId,
              sizeId: variant.sizeId,
              priceOverrideUsd: variant.priceOverrideUsd,
              weightGrams: variant.weightGrams,
              dimensions:
                variant.dimensions === null
                  ? undefined
                  : (variant.dimensions as Prisma.InputJsonValue),
              isActive: variant.isActive,
            },
          });
          if (variant.media.length)
            await tx.variantMedia.createMany({
              data: variant.media.map((item) => ({
                variantId: next.id,
                mediaId: item.mediaId,
                sortOrder: item.sortOrder,
              })),
            });
        }
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "catalog.product.duplicate",
            entityType: "Product",
            entityId: created.id,
            before: { sourceId: source.id },
            after: { status: "DRAFT" },
          },
        });
        return created;
      }),
    );
    revalidateCatalog(copy.slugI18n);
  });
}

async function validateReferences(input: z.infer<typeof productInputSchema>) {
  const mediaIds = [
    ...new Set([
      ...input.mediaIds,
      ...input.variants.flatMap((v) => v.mediaIds),
      ...(input.seoOgMediaId ? [input.seoOgMediaId] : []),
    ]),
  ];
  const [category, brands, collections, colors, sizes, markets, media] =
    await Promise.all([
      db.category.count({ where: { id: input.categoryId, deletedAt: null } }),
      input.brandId
        ? db.brand.count({ where: { id: input.brandId, deletedAt: null } })
        : Promise.resolve(1),
      db.collection.count({
        where: {
          id: { in: [...new Set(input.collectionIds)] },
          deletedAt: null,
        },
      }),
      db.color.count({
        where: {
          id: { in: [...new Set(input.variants.map((v) => v.colorId))] },
          deletedAt: null,
        },
      }),
      db.size.count({
        where: {
          id: { in: [...new Set(input.variants.map((v) => v.sizeId))] },
          deletedAt: null,
        },
      }),
      db.market.count({ where: { id: { in: [...new Set(input.marketIds)] } } }),
      mediaIds.length
        ? db.media.count({
            where: {
              id: { in: mediaIds },
              kind: "image",
              status: "READY",
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
    ]);
  const uniqueCollections = new Set(input.collectionIds).size;
  const uniqueColors = new Set(input.variants.map((v) => v.colorId)).size;
  const uniqueSizes = new Set(input.variants.map((v) => v.sizeId)).size;
  if (
    category !== 1 ||
    brands !== 1 ||
    collections !== uniqueCollections ||
    colors !== uniqueColors ||
    sizes !== uniqueSizes ||
    markets !== new Set(input.marketIds).size ||
    media !== mediaIds.length
  )
    throw new z.ZodError([]);
}

function localized(data: FormData, prefix: string) {
  return {
    fa: String(data.get(`${prefix}Fa`) || ""),
    tr: String(data.get(`${prefix}Tr`) || ""),
    en: String(data.get(`${prefix}En`) || ""),
  };
}
function optional(data: FormData, key: string) {
  return String(data.get(key) || "").trim();
}
function splitList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseJson<T>(value: FormDataEntryValue | null, fallback: T): unknown {
  try {
    return JSON.parse(String(value || "")) as unknown;
  } catch {
    return fallback;
  }
}
function suffixLocalized(value: unknown, suffix: string) {
  const source = value as Record<string, string>;
  return {
    fa: `${source.fa || ""}-${suffix}`,
    tr: `${source.tr || ""}-${suffix}`,
    en: `${source.en || ""}-${suffix}`,
  };
}
function revalidateCatalog(...slugs: unknown[]) {
  revalidateTag("catalog");
  revalidateTag("homepage");
  revalidatePath("/admin/catalog/products");
  for (const locale of ["fa", "tr", "en"] as const) {
    revalidatePath(`/${locale}`);
    for (const value of slugs) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const slug = (value as Record<string, unknown>)[locale];
        if (typeof slug === "string") revalidatePath(`/${locale}/p/${slug}`);
      }
    }
  }
}
