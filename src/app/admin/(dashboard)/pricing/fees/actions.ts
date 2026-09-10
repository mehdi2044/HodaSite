"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { parseFeeRuleParams } from "@/modules/fees";

const schema = z.object({
  id: z.string().optional(),
  marketId: z.string(),
  nameFa: z.string().min(2),
  nameTr: z.string().min(2),
  nameEn: z.string().min(2),
  type: z.enum(["SHIPPING", "CUSTOMS", "SERVICE", "TAX"]),
  method: z.enum([
    "FIXED",
    "PERCENT",
    "PER_KG",
    "WEIGHT_BRACKET",
    "VALUE_BRACKET",
    "PER_ITEM",
  ]),
  params: z.string().transform((value, ctx) => {
    try {
      const result = JSON.parse(value);
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error();
      return result as Record<string, unknown>;
    } catch {
      ctx.addIssue({ code: "custom", message: "پارامتر JSON معتبر نیست" });
      return z.NEVER;
    }
  }),
  province: z.string().optional(),
  city: z.string().optional(),
  postalPrefix: z.string().optional(),
  categoryIds: z.array(z.string()).default([]),
  priority: z.coerce.number().int(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  absorb: z.string().optional(),
  taxable: z.string().optional(),
  selectable: z.string().optional(),
  isActive: z.string().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.union([z.literal(""), z.coerce.date()]),
});

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, "fees.manage");
  return session.user.id;
}

export async function saveFeeRule(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await currentUser();
    const parsed = schema.parse({
      ...Object.fromEntries(data),
      categoryIds: data.getAll("categoryIds"),
    });
    await withMutation(async () => {
      const market = await db.market.findUniqueOrThrow({
        where: { id: parsed.marketId },
      });
      const params = parseFeeRuleParams(parsed.method, parsed.params);
      const knownCategories = await db.category.count({
        where: { id: { in: parsed.categoryIds }, deletedAt: null },
      });
      if (knownCategories !== new Set(parsed.categoryIds).size)
        throw new Error("One or more fee categories are invalid");
      const values: Prisma.FeeRuleUncheckedCreateInput = {
        marketId: parsed.marketId,
        labelI18n: { fa: parsed.nameFa, tr: parsed.nameTr, en: parsed.nameEn },
        type: parsed.type,
        method: parsed.method,
        params: params as Prisma.InputJsonValue,
        currency: market.currency,
        province: parsed.province || null,
        city: parsed.city || null,
        postalPrefix: parsed.postalPrefix || null,
        categoryIds: parsed.categoryIds,
        priority: parsed.priority,
        minAmount: parsed.minAmount || null,
        maxAmount: parsed.maxAmount || null,
        absorb: parsed.absorb === "on",
        taxable: parsed.taxable === "on",
        selectable: parsed.type === "SHIPPING" && parsed.selectable === "on",
        isActive: parsed.isActive === "on",
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil || null,
      };
      const before = parsed.id
        ? await db.feeRule.findUnique({ where: { id: parsed.id } })
        : null;
      const row = parsed.id
        ? await db.feeRule.update({ where: { id: parsed.id }, data: values })
        : await db.feeRule.create({ data: values });
      await db.auditLog.create({
        data: {
          userId,
          action: parsed.id ? "fee.update" : "fee.create",
          entityType: "FeeRule",
          entityId: row.id,
          before: before
            ? {
                type: before.type,
                method: before.method,
                params: before.params,
              }
            : undefined,
          after: { type: row.type, method: row.method, params: row.params },
        },
      });
    });
    revalidateTag("fees");
    revalidatePath("/admin/pricing/fees");
  });
}

export async function toggleFeeRule(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await currentUser();
    const id = z.string().parse(data.get("id"));
    await withMutation(async () => {
      const before = await db.feeRule.findUniqueOrThrow({ where: { id } });
      await db.feeRule.update({
        where: { id },
        data: { isActive: !before.isActive },
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "fee.toggle",
          entityType: "FeeRule",
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive: !before.isActive },
        },
      });
    });
    revalidateTag("fees");
    revalidatePath("/admin/pricing/fees");
  });
}
