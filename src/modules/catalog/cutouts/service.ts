import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { lockMediaReferences } from "@/modules/media";
import { cutoutInputSchema } from "./contracts";
import { inspectCutoutImage } from "./alpha";
import { imageFingerprint, storeCutoutModels } from "./models";
export async function saveCatalogCutout(actorId: string, raw: unknown) {
  await assertCan(actorId, "catalog.product.edit");
  const input = cutoutInputSchema.parse(raw);
  const checked = await inspectCutoutImage(input.mediaId);
  if (checked.imageFingerprint !== input.expectedImageFingerprint)
    throw new RevisionConflictError();
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${input.productId} FOR UPDATE`;
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          deletedAt: null,
          coinPackCoins: null,
          category: { deletedAt: null },
        },
      });
      if (!product || product.fittingSlot !== input.slot)
        throw new z.ZodError([]);
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${product.categoryId} FOR SHARE`;
      if (
        !(await tx.category.count({
          where: { id: product.categoryId, deletedAt: null },
        }))
      )
        throw new z.ZodError([]);
      const variants = await tx.$queryRaw<
        { id: string; colorId: string; sizeId: string; isActive: boolean }[]
      >`SELECT id,"colorId","sizeId","isActive" FROM "Variant" WHERE "productId"=${input.productId} ORDER BY id FOR UPDATE`;
      const sizeIds = [...new Set(variants.map((v) => v.sizeId))].sort();
      if (sizeIds.length)
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Size" WHERE id IN (${Prisma.join(sizeIds)}) ORDER BY id FOR SHARE`,
        );
      const sizes = await tx.size.findMany({
        where: { id: { in: sizeIds }, deletedAt: null },
        select: { id: true },
      });
      if (
        !variants.some(
          (v) =>
            v.colorId === input.colorId &&
            v.isActive &&
            sizes.some((size) => size.id === v.sizeId) &&
            (!input.variantId || v.id === input.variantId),
        )
      )
        throw new z.ZodError([]);
      await tx.$queryRaw`SELECT id FROM "Color" WHERE id=${input.colorId} FOR SHARE`;
      if (
        !(await tx.color.count({
          where: { id: input.colorId, deletedAt: null },
        }))
      )
        throw new z.ZodError([]);
      // Shared profile and variant override writers serialize behind the product;
      // the partial unique DB index also protects nullable shared identities.
      const prior = await tx.catalogCutout.findFirst({
        where: input.variantId
          ? { variantId: input.variantId }
          : {
              productId: input.productId,
              colorId: input.colorId,
              variantId: null,
            },
      });
      if (prior)
        await tx.$queryRaw`SELECT id FROM "CatalogCutout" WHERE id=${prior.id} FOR UPDATE`;
      const before = prior
        ? await tx.catalogCutout.findUniqueOrThrow({ where: { id: prior.id } })
        : null;
      if ((before?.version ?? 0) !== input.expectedVersion)
        throw new RevisionConflictError();
      const source = await tx.integration.findUnique({
        where: { key: "fitting-room" },
      });
      if (source)
        await tx.$queryRaw`SELECT id FROM "Integration" WHERE id=${source.id} FOR SHARE`;
      const models = await storeCutoutModels(tx);
      const selected = input.geometry.models.map((placement) =>
        models.find((m) => m.id === placement.modelId),
      );
      if (selected.some((m) => !m)) throw new z.ZodError([]);
      if (
        new Set(input.expectedModelFingerprints.map((m) => m.modelId)).size !==
          input.expectedModelFingerprints.length ||
        input.expectedModelFingerprints.length !== selected.length ||
        selected.some(
          (m) =>
            !input.expectedModelFingerprints.some(
              (expected) =>
                expected.modelId === m!.id &&
                expected.fingerprint === m!.fingerprint,
            ),
        )
      )
        throw new RevisionConflictError();
      await lockMediaReferences(
        tx,
        [input.mediaId, ...selected.map((m) => m!.mediaId)],
        { readyImages: true },
      );
      const media = await tx.media.findUniqueOrThrow({
        where: { id: input.mediaId },
      });
      if (checked.imageFingerprint !== imageFingerprint(media))
        throw new RevisionConflictError();
      // Re-read models after any Media wait so geometry cannot bind old pixels.
      const live = await storeCutoutModels(tx);
      if (
        selected.some(
          (m) =>
            !live.some(
              (current) =>
                current.id === m!.id && current.fingerprint === m!.fingerprint,
            ),
        )
      )
        throw new RevisionConflictError();
      await assertCan(actorId, "catalog.product.edit");
      const data = {
        productId: input.productId,
        colorId: input.colorId,
        variantId: input.variantId,
        mediaId: input.mediaId,
        slot: input.slot,
        anchor: input.anchor,
        geometry: input.geometry as unknown as Prisma.InputJsonValue,
        validation: {
          version: 1,
          ...checked,
          confirmedAt: new Date().toISOString(),
          models: selected.map((m) => ({
            modelId: m!.id,
            mediaId: m!.mediaId,
            fingerprint: m!.fingerprint,
          })),
        } as Prisma.InputJsonValue,
        deletedAt: null,
        version: (before?.version ?? 0) + 1,
      };
      const row = before
        ? await tx.catalogCutout.update({ where: { id: before.id }, data })
        : await tx.catalogCutout.create({ data });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "catalog.cutout.saved",
          entityType: "CatalogCutout",
          entityId: row.id,
          before: before ? JSON.parse(JSON.stringify(before)) : Prisma.DbNull,
          after: JSON.parse(JSON.stringify(row)),
        },
      });
      return { id: row.id, version: row.version };
    }),
  );
}
export async function archiveCatalogCutout(
  actorId: string,
  id: string,
  expectedVersion: number,
) {
  await assertCan(actorId, "catalog.product.edit");
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .parse(id);
  z.number().int().min(0).max(2147483646).parse(expectedVersion);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      const candidate = await tx.catalogCutout.findUniqueOrThrow({
        where: { id },
      });
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${candidate.productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "CatalogCutout" WHERE id=${id} FOR UPDATE`;
      const before = await tx.catalogCutout.findUniqueOrThrow({
        where: { id },
      });
      if (before.productId !== candidate.productId)
        throw new RevisionConflictError();
      if (before.version !== expectedVersion || before.deletedAt)
        throw new RevisionConflictError();
      await assertCan(actorId, "catalog.product.edit");
      const after = await tx.catalogCutout.update({
        where: { id },
        data: { deletedAt: new Date(), version: before.version + 1 },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "catalog.cutout.archived",
          entityType: "CatalogCutout",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
      return { id, version: after.version };
    }),
  );
}
