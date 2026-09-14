"use server";
import { z } from "zod";
import { runAction } from "@/lib/action-result";
import { auth } from "@/modules/auth";
import { db } from "@/lib/db";
import { assertCan, ForbiddenError, UnauthorizedError } from "@/modules/access";
import * as operations from "@/modules/finance/operations";
export async function financialOperation(
  kind: string,
  raw: unknown,
): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const handlers: Record<string, (v: unknown) => Promise<string>> = {
    config: operations.saveFinanceConfig,
    alerts: operations.refreshFinancialAlerts,
    opening: operations.openDefaultCosts,
    supplier: operations.createSupplier,
    purchase: operations.createPurchase,
    receive: operations.receivePurchase,
    expense: operations.createExpense,
    approve: operations.approveExpense,
    partner: operations.createPartner,
    capital: operations.createCapital,
  };
  try {
    let id = "";
    const result = await runAction(async () => {
      if (!Object.hasOwn(handlers, kind)) throw new z.ZodError([]);
      const actor = (await auth())?.user?.id;
      if (!actor) throw new UnauthorizedError();
      const shape = z
        .object({ marketId: z.string().optional(), id: z.string().optional() })
        .parse(raw);
      let marketId = shape.marketId;
      if (kind === "receive" || kind === "approve") {
        const subject =
          kind === "receive"
            ? await db.purchaseOrder.findUnique({
                where: { id: shape.id ?? "" },
                select: { marketId: true },
              })
            : await db.expense.findUnique({
                where: { id: shape.id ?? "" },
                select: { marketId: true },
              });
        if (!subject) throw new ForbiddenError("finance.journal.post");
        marketId = subject.marketId;
      }
      await assertCan(
        actor,
        kind === "expense" ? "finance.expense.create" : "finance.journal.post",
        { marketId },
      );
      id = await handlers[kind](raw);
    });
    return result.ok ? { ok: true, id } : { ok: false, code: result.code };
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
}
