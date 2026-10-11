"use server";
import { z } from "zod";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import { MaintenanceError } from "@/lib/mutation-gate";
import {
  createFittingSession,
  sessionView,
  walletView,
  saveLook,
  FittingError,
  fittingConfig,
  fittingProducts,
} from "@/modules/fitting";
import { addCartItems } from "@/modules/cart";
import { revalidatePath } from "next/cache";
async function customer() {
  const c = await currentCustomer();
  if (!c || c.isGuest || !c.isActive) throw new FittingError("LOGIN_REQUIRED");
  return c;
}
export async function loadFittingVariants(locale: string, raw: unknown) {
  return safe(async () => {
    const l = z.enum(["fa", "tr", "en"]).parse(locale);
    const input = z
      .object({
        marketId: z.string().min(1).max(100),
        productId: z.string().min(1).max(100).optional(),
        after: z.string().min(1).max(100).optional(),
        variantIds: z
          .array(z.string().min(1).max(100))
          .min(1)
          .max(4)
          .optional(),
        owned: z.boolean(),
        afterProduct: z.string().min(1).max(100).optional(),
        query: z.string().max(100).optional(),
      })
      .strict()
      .refine((v) =>
        v.productId
          ? !v.variantIds && !v.afterProduct && !v.query
          : v.variantIds
            ? !v.after && !v.afterProduct && !v.query
            : !!v.afterProduct && !v.after,
      )
      .parse(raw);
    const c = await customer(),
      { market } = await getRequestContext(l);
    if (market.id !== input.marketId)
      throw new FittingError("REQUEST_CONFLICT");
    if (!(await fittingConfig()).enabled) throw new FittingError("DISABLED");
    return {
      products: await fittingProducts(
        c.id,
        market.id,
        l,
        input.query ?? "",
        input.owned,
        input,
      ),
    };
  });
}
async function safe<T extends object>(fn: () => Promise<T>) {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof FittingError
          ? e.code
          : e instanceof z.ZodError
            ? "INVALID_SELECTION"
            : e instanceof MaintenanceError
              ? "MAINTENANCE"
              : "REQUEST_UNKNOWN",
    };
  }
}
export async function generateFitting(locale: string, input: unknown) {
  return safe(async () => {
    const l = z.enum(["fa", "tr", "en"]).parse(locale),
      c = await customer(),
      { market } = await getRequestContext(l);
    return createFittingSession(c.id, market.id, l, input);
  });
}
export async function readFitting(id: string) {
  return safe(async () => {
    const c = await customer();
    const session = await sessionView(
      c.id,
      z.string().min(1).max(100).parse(id),
    );
    const wallet = await walletView(c.id);
    return { session, balance: wallet.balance };
  });
}
export async function saveFitting(id: string, name: string) {
  return safe(async () => {
    await saveLook((await customer()).id, id, name);
    return {};
  });
}
export async function addFittingItems(locale: string, ids: string[]) {
  return safe(async () => {
    const l = z.enum(["fa", "tr", "en"]).parse(locale);
    await customer();
    const values = z.array(z.string().min(1)).min(1).max(4).parse(ids);
    await addCartItems(l, values);
    revalidatePath(`/${l}/cart`);
    return {};
  });
}
