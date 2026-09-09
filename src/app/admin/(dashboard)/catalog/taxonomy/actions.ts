"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { localizedRequiredSchema } from "@/modules/catalog";

const common = z.object({
  kind: z.enum([
    "brand",
    "category",
    "collection",
    "color",
    "size",
    "sizeGuide",
  ]),
  id: z.string().optional(),
});

export async function saveTaxonomy(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "catalog.product.edit");
    const base = common.parse({
      kind: data.get("kind"),
      id: value(data, "id") || undefined,
    });
    const before = await readBefore(base.kind, base.id);
    const entityId = await withMutation(() =>
      db.$transaction(async (tx) => {
        let id = base.id ?? "";
        if (base.kind === "brand") {
          const input = z
            .object({ slug: slugSchema, nameI18n: localizedRequiredSchema })
            .parse({
              slug: value(data, "slug"),
              nameI18n: localized(data, "name"),
            });
          const row = base.id
            ? await tx.brand.update({ where: { id: base.id }, data: input })
            : await tx.brand.create({ data: input });
          id = row.id;
        } else if (base.kind === "collection") {
          const input = z
            .object({ slug: slugSchema, titleI18n: localizedRequiredSchema })
            .parse({
              slug: value(data, "slug"),
              titleI18n: localized(data, "name"),
            });
          const row = base.id
            ? await tx.collection.update({
                where: { id: base.id },
                data: input,
              })
            : await tx.collection.create({ data: input });
          id = row.id;
        } else if (base.kind === "color") {
          const input = z
            .object({
              code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
              hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
              nameI18n: localizedRequiredSchema,
              swatchMediaId: z.string().optional(),
            })
            .parse({
              code: value(data, "code").toUpperCase(),
              hex: value(data, "hex"),
              nameI18n: localized(data, "name"),
              swatchMediaId: value(data, "swatchMediaId") || undefined,
            });
          if (input.swatchMediaId) await requireImage(input.swatchMediaId);
          const row = base.id
            ? await tx.color.update({
                where: { id: base.id },
                data: { ...input, swatchMediaId: input.swatchMediaId || null },
              })
            : await tx.color.create({ data: input });
          id = row.id;
        } else if (base.kind === "size") {
          const input = z
            .object({
              scale: z.enum(["EU", "TR", "US", "CA", "INTL"]),
              value: z.string().trim().min(1).max(20),
              groupKey: z.string().trim().min(1).max(40),
              sortOrder: z.number().int().min(0).max(1000),
            })
            .parse({
              scale: data.get("scale"),
              value: value(data, "value"),
              groupKey: value(data, "groupKey"),
              sortOrder: Number(data.get("sortOrder") || 0),
            });
          const row = base.id
            ? await tx.size.update({ where: { id: base.id }, data: input })
            : await tx.size.create({ data: input });
          id = row.id;
        } else if (base.kind === "category") {
          const input = z
            .object({
              slugI18n: z.object({
                fa: localizedSlug,
                tr: localizedSlug,
                en: localizedSlug,
              }),
              titleI18n: localizedRequiredSchema,
              descriptionI18n: localizedRequiredSchema,
              gender: z.enum(["WOMEN", "MEN", "KIDS", "UNISEX"]),
              parentId: z.string().optional(),
              mediaId: z.string().optional(),
              sortOrder: z.number().int().min(0).max(1000),
            })
            .parse({
              slugI18n: localized(data, "slug"),
              titleI18n: localized(data, "name"),
              descriptionI18n: localized(data, "description"),
              gender: data.get("gender"),
              parentId: value(data, "parentId") || undefined,
              mediaId: value(data, "mediaId") || undefined,
              sortOrder: Number(data.get("sortOrder") || 0),
            });
          if (input.parentId === base.id) throw new z.ZodError([]);
          if (input.mediaId) await requireImage(input.mediaId);
          const row = base.id
            ? await tx.category.update({
                where: { id: base.id },
                data: {
                  ...input,
                  parentId: input.parentId || null,
                  mediaId: input.mediaId || null,
                },
              })
            : await tx.category.create({ data: input });
          id = row.id;
        } else {
          const input = z
            .object({
              scope: z.enum(["brand", "category", "product"]),
              refId: z.string().min(1),
              nameI18n: localizedRequiredSchema,
              unit: z.enum(["cm", "in"]),
              tableI18n: z.record(z.string(), z.unknown()),
            })
            .parse({
              scope: data.get("scope"),
              refId: value(data, "refId"),
              nameI18n: localized(data, "name"),
              unit: data.get("unit"),
              tableI18n: parseJson(data.get("tableI18n")),
            });
          const dataInput = {
            ...input,
            tableI18n:
              input.tableI18n as import("@prisma/client").Prisma.InputJsonValue,
          };
          const row = base.id
            ? await tx.sizeGuide.update({
                where: { id: base.id },
                data: dataInput,
              })
            : await tx.sizeGuide.create({ data: dataInput });
          id = row.id;
        }
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: `catalog.${base.kind}.${base.id ? "update" : "create"}`,
            entityType: base.kind,
            entityId: id,
            before: before as object | undefined,
          },
        });
        return id;
      }),
    );
    void entityId;
    revalidateTag("catalog");
    revalidatePath("/admin/catalog/taxonomy");
  });
}

export async function archiveTaxonomy(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "catalog.product.edit");
    const parsed = common
      .extend({ id: z.string().min(1) })
      .parse({ kind: data.get("kind"), id: data.get("id") });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        if (await hasLiveReferences(tx, parsed.kind, parsed.id))
          throw new z.ZodError([]);
        if (parsed.kind === "sizeGuide")
          await tx.sizeGuide.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        else if (parsed.kind === "brand")
          await tx.brand.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        else if (parsed.kind === "category")
          await tx.category.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        else if (parsed.kind === "collection")
          await tx.collection.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        else if (parsed.kind === "color")
          await tx.color.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        else
          await tx.size.update({
            where: { id: parsed.id },
            data: { deletedAt: new Date() },
          });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: `catalog.${parsed.kind}.archive`,
            entityType: parsed.kind,
            entityId: parsed.id,
          },
        });
      }),
    );
    revalidateTag("catalog");
    revalidatePath("/admin/catalog/taxonomy");
  });
}

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const localizedSlug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
function value(data: FormData, key: string) {
  return String(data.get(key) || "").trim();
}
function localized(data: FormData, prefix: string) {
  return {
    fa: value(data, `${prefix}Fa`),
    tr: value(data, `${prefix}Tr`),
    en: value(data, `${prefix}En`),
  };
}
function parseJson(raw: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(raw || "{}")) as unknown;
  } catch {
    return undefined;
  }
}
async function requireImage(id: string) {
  if (
    !(await db.media.findFirst({
      where: { id, kind: "image", status: "READY", deletedAt: null },
      select: { id: true },
    }))
  )
    throw new z.ZodError([]);
}
async function readBefore(kind: z.infer<typeof common>["kind"], id?: string) {
  if (!id) return null;
  if (kind === "brand") return db.brand.findUnique({ where: { id } });
  if (kind === "category") return db.category.findUnique({ where: { id } });
  if (kind === "collection") return db.collection.findUnique({ where: { id } });
  if (kind === "color") return db.color.findUnique({ where: { id } });
  if (kind === "size") return db.size.findUnique({ where: { id } });
  return db.sizeGuide.findUnique({ where: { id } });
}

async function hasLiveReferences(
  tx: Prisma.TransactionClient,
  kind: z.infer<typeof common>["kind"],
  id: string,
) {
  if (kind === "sizeGuide") return false;
  const base = { deletedAt: null, status: "ACTIVE" as const };
  if (kind === "category")
    return (await tx.product.count({ where: { ...base, categoryId: id } })) > 0;
  if (kind === "brand")
    return (await tx.product.count({ where: { ...base, brandId: id } })) > 0;
  if (kind === "collection")
    return (
      (await tx.product.count({
        where: { ...base, collections: { some: { id } } },
      })) > 0
    );
  return (
    (await tx.product.count({
      where: {
        ...base,
        variants: {
          some: kind === "color" ? { colorId: id } : { sizeId: id },
        },
      },
    })) > 0
  );
}
