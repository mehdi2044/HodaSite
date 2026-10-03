"use server";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { assertCan, ForbiddenError, UnauthorizedError } from "@/modules/access";
import { auth } from "@/modules/auth";
import { MaintenanceError } from "@/lib/mutation-gate";
import {
  savePromotionProgram,
  issuePromotionCoupons,
  setPromotionCouponStatus,
  simulatePromotionCart,
  PromotionError,
} from "@/modules/promotions/server";
async function run<T>(input: unknown, operation: () => Promise<T>) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const { marketId } = z
      .object({ marketId: z.string().regex(/^[\w-]{1,100}$/) })
      .parse(input);
    await assertCan(session.user.id, "pricing.sale_price.edit", { marketId });
    return { ok: true as const, data: await operation() };
  } catch (e) {
    if (e instanceof PromotionError)
      return { ok: false as const, code: e.code };
    if (e instanceof ZodError)
      return { ok: false as const, code: "VALIDATION" };
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError)
      return { ok: false as const, code: "FORBIDDEN" };
    if (e instanceof MaintenanceError)
      return { ok: false as const, code: "MAINTENANCE" };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false as const, code: "DUPLICATE" };
    throw e;
  }
}
export async function saveProgramAction(input: unknown) {
  return run(input, () => savePromotionProgram(input));
}
export async function issueCouponsAction(input: unknown) {
  return run(input, () => issuePromotionCoupons(input));
}
export async function couponStatusAction(input: unknown) {
  return run(input, () => setPromotionCouponStatus(input));
}
export async function simulateAction(input: unknown) {
  return run(input, () => simulatePromotionCart(input));
}
