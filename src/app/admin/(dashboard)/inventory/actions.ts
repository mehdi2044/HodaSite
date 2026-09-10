"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  receiveStock,
  receiveStockBatch,
  adjustStock,
  snapshotPurchaseCost,
  type ReceiveStockInput,
} from "@/modules/inventory";

async function user(permission: string) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, permission);
  return session.user.id;
}
const receiveSchema = z.object({
  warehouseId: z.string(),
  variantId: z.string(),
  quantity: z.coerce.number().int().positive(),
  unitCostAmount: z.string().regex(/^\d+(\.\d+)?$/),
  unitCostCurrency: z.enum(["USD", "TRY", "CAD", "IRT"]),
  receivedAt: z.coerce.date(),
});

export async function receiveInventory(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("inventory.receive");
    const parsed = receiveSchema.parse(Object.fromEntries(data));
    await withMutation(async () => {
      const snapshots = await snapshotPurchaseCost(
        parsed.unitCostAmount,
        parsed.unitCostCurrency,
        parsed.receivedAt,
      );
      await receiveStock({
        ...parsed,
        ...snapshots,
        createdBy: userId,
      });
    });
    revalidatePath("/admin/inventory");
  });
}

export async function adjustInventory(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("inventory.stock.adjust");
    const parsed = z
      .object({
        stockItemId: z.string(),
        quantity: z.coerce
          .number()
          .int()
          .refine((x) => x !== 0),
        reason: z.string().min(3),
      })
      .parse(Object.fromEntries(data));
    await withMutation(async () => {
      let receipt;
      if (parsed.quantity > 0) {
        const cost = receiveSchema
          .pick({ unitCostAmount: true, unitCostCurrency: true })
          .parse(Object.fromEntries(data));
        const receivedAt = new Date();
        const snapshots = await snapshotPurchaseCost(
          cost.unitCostAmount,
          cost.unitCostCurrency,
          receivedAt,
        );
        receipt = { ...cost, ...snapshots, receivedAt };
      }
      await adjustStock({ ...parsed, receipt, createdBy: userId });
    });
    revalidatePath("/admin/inventory");
  });
}

export async function saveGlobalLowStockThreshold(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("inventory.stock.adjust");
    const threshold = z.coerce
      .number()
      .int()
      .min(0)
      .max(100_000)
      .parse(data.get("threshold"));
    await withMutation(async () => {
      const current = await db.siteSettings.findUniqueOrThrow({
        where: { id: "default" },
        select: { inventory: true },
      });
      const before = current.inventory as Prisma.JsonObject;
      const inventory = { ...before, lowStockThreshold: threshold };
      await db.$transaction([
        db.siteSettings.update({
          where: { id: "default" },
          data: { inventory },
        }),
        db.auditLog.create({
          data: {
            userId,
            action: "inventory.threshold.global.update",
            entityType: "SiteSettings",
            entityId: "default",
            before,
            after: inventory,
          },
        }),
      ]);
    });
    revalidatePath("/admin/inventory");
    revalidatePath("/", "layout");
  });
}

export async function saveStockLowStockThreshold(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("inventory.stock.adjust");
    const parsed = z
      .object({
        stockItemId: z.string().min(1),
        threshold: z.union([
          z.literal("").transform(() => null),
          z.coerce.number().int().min(0).max(100_000),
        ]),
      })
      .parse(Object.fromEntries(data));
    await withMutation(async () => {
      const stock = await db.stockItem.findUniqueOrThrow({
        where: { id: parsed.stockItemId },
        select: { id: true, lowStockThreshold: true },
      });
      await db.$transaction([
        db.stockItem.update({
          where: { id: stock.id },
          data: { lowStockThreshold: parsed.threshold },
        }),
        db.auditLog.create({
          data: {
            userId,
            action: "inventory.threshold.stock.update",
            entityType: "StockItem",
            entityId: stock.id,
            before: { lowStockThreshold: stock.lowStockThreshold },
            after: { lowStockThreshold: parsed.threshold },
          },
        }),
      ]);
    });
    revalidatePath("/admin/inventory");
    revalidatePath("/", "layout");
  });
}

export async function importInventoryCsv(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("inventory.receive");
    const file = z.instanceof(File).parse(data.get("file"));
    if (file.size > 2_000_000) throw new Error("CSV is too large");
    const lines = (await file.text())
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean);
    const header = lines
      .shift()
      ?.split(",")
      .map((x) => x.trim());
    if (!header || header.join(",") !== "sku,quantity,unitCost,currency")
      throw new Error("Invalid CSV header");
    await withMutation(async () => {
      if (!lines.length || lines.length > 1000)
        throw new Error("CSV must contain 1 to 1000 rows");
      const warehouse = await db.warehouse.findFirstOrThrow({
        where: { isActive: true },
        orderBy: { code: "asc" },
      });
      const inputs: ReceiveStockInput[] = [];
      const receivedAt = new Date();
      for (const line of lines) {
        const fields = line.split(",").map((x) => x.trim());
        if (fields.length !== 4) throw new Error("Invalid CSV row");
        const [sku, quantity, unitCost, currency] = fields;
        const variant = await db.variant.findUniqueOrThrow({ where: { sku } });
        const parsed = receiveSchema.parse({
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantity,
          unitCostAmount: unitCost,
          unitCostCurrency: currency,
          receivedAt,
        });
        const snapshots = await snapshotPurchaseCost(
          parsed.unitCostAmount,
          parsed.unitCostCurrency,
          receivedAt,
        );
        inputs.push({ ...parsed, ...snapshots, createdBy: userId });
      }
      await receiveStockBatch(inputs);
    });
    revalidatePath("/admin/inventory");
  });
}
