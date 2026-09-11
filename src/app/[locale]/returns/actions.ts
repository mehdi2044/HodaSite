"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentCustomer } from "@/modules/customers";
import { requestReturn } from "@/modules/returns/service";
import { CommerceError } from "@/modules/orders/state";
export async function requestReturnAction(form: FormData) {
  const customer = await currentCustomer();
  if (!customer) return { error: "LOGIN_REQUIRED" };
  try {
    const quantity = z.coerce
      .number()
      .int()
      .positive()
      .parse(form.get("quantity"));
    await requestReturn(customer.id, {
      orderId: form.get("orderId"),
      requestKey: form.get("requestKey"),
      type: form.get("type"),
      reasonCode: form.get("reasonCode"),
      note: form.get("note") ?? "",
      items: [
        {
          orderItemId: form.get("orderItemId"),
          quantity,
          ...(form.get("exchangeVariantId")
            ? { exchangeVariantId: form.get("exchangeVariantId") }
            : {}),
        },
      ],
    });
    revalidatePath("/[locale]/orders", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof CommerceError ? e.code : "VALIDATION" };
  }
}
