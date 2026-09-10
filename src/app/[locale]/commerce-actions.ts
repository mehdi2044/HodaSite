"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { withMutation, MaintenanceError } from "@/lib/mutation-gate";
import { getClientIp } from "@/lib/net";
import {
  changeCart,
  changeCartMarket,
  saveCheckout,
  readCart,
  CART_COOKIE,
} from "@/modules/cart";
import { quoteCart } from "@/modules/fees";
import { placeOrder, addressSchema, localeSchema } from "@/modules/checkout";
import {
  requestCustomerOtp,
  customerSignIn,
  customerSignOut,
  currentCustomer,
} from "@/modules/customers";
import { submitReceipt } from "@/modules/payments";
import { CommerceError } from "@/modules/orders";

type Result = {
  error?: string;
  url?: string;
  ok?: boolean;
  challengeId?: string;
};
async function safe(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof CommerceError) return { error: e.code };
    if (e instanceof ZodError) return { error: "VALIDATION" };
    if (e instanceof MaintenanceError) return { error: "MAINTENANCE" };
    if (e instanceof AuthError) return { error: "LOGIN_FAILED" };
    return { error: "REQUEST_FAILED" };
  }
}
export async function updateCartAction(locale: string, form: FormData) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    await changeCart(
      l,
      z.string().min(1).parse(form.get("variantId")),
      z.coerce.number().int().min(0).max(100).parse(form.get("quantity")),
      form.get("mode") === "add",
    );
    revalidatePath(`/${l}/cart`);
    return { ok: true };
  });
}
export async function switchCartAction(locale: string) {
  return safe(async () => {
    await changeCartMarket(localeSchema.parse(locale));
    revalidatePath(`/${locale}/cart`);
    return { ok: true };
  });
}
export async function saveAddressAction(locale: string, form: FormData) {
  return safe(async () => {
    const l = localeSchema.parse(locale),
      address = addressSchema.parse(Object.fromEntries(form));
    await withMutation(() => saveCheckout(address));
    return { url: `/${l}/checkout?step=2` };
  });
}
export async function autosaveAddressAction(form: FormData) {
  return safe(async () => {
    const data = z
      .record(z.string(), z.string().max(2000))
      .parse(Object.fromEntries(form));
    await withMutation(() => saveCheckout(data));
    return { ok: true };
  });
}
export async function placeOrderAction(locale: string, form: FormData) {
  const result = await safe(async () => {
    localeSchema.parse(locale);
    const token = (await cookies()).get(CART_COOKIE)?.value;
    const order = await placeOrder(
      addressSchema.parse(JSON.parse(z.string().parse(form.get("address")))),
      form.get("terms") === "on",
      z.coerce.number().int().parse(form.get("revision")),
      z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .parse(form.get("expectedTotal")),
    );
    if (token)
      (await cookies()).set(`hoda.order.${order.number}`, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: (process.env.APP_URL ?? "").startsWith("https:"),
        path: "/",
        maxAge: 30 * 86400,
      });
    revalidatePath(`/${locale}/cart`);
    return { url: `/${order.locale}/orders/${order.number}/pay` };
  });
  // Navigation must happen on the server: cookie/revalidation refreshes would
  // otherwise re-render the completed cart and redirect checkout back to /cart.
  if (result.url) redirect(result.url);
  return result;
}
export async function requestOtpAction(locale: string, form: FormData) {
  return safe(async () => {
    const result = await requestCustomerOtp(
      z.string().parse(form.get("email")),
      localeSchema.parse(locale),
      getClientIp(await headers()) ?? "unknown",
    );
    return result.ok
      ? { ok: true, challengeId: result.challengeId }
      : { error: "RATE_LIMIT" };
  });
}
export async function verifyOtpAction(locale: string, form: FormData) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    await customerSignIn("customer-otp", {
      challengeId: form.get("challengeId"),
      ...(form.has("token")
        ? { token: z.string().min(1).max(100).parse(form.get("token")) }
        : {
            code: z
              .string()
              .regex(/^\d{6}$/)
              .parse(form.get("code")),
          }),
      redirect: false,
    });
    const next = String(form.get("next") ?? "");
    return {
      url: /^\/(fa|tr|en)\/(checkout|orders\/[A-Z]{2}-[0-9]+\/pay)$/.test(next)
        ? next
        : `/${l}/account`,
    };
  });
}
export async function logoutCustomerAction(locale: string) {
  const jar = await cookies();
  for (const c of jar.getAll())
    if (c.name === CART_COOKIE || c.name.startsWith("hoda.order."))
      jar.delete(c.name);
  await customerSignOut({ redirectTo: `/${localeSchema.parse(locale)}` });
}
export async function uploadReceiptAction(
  locale: string,
  number: string,
  form: FormData,
) {
  return safe(async () => {
    localeSchema.parse(locale);
    const file = form.get("receipt");
    if (!(file instanceof File)) throw new CommerceError("RECEIPT_INVALID");
    await withMutation(() =>
      submitReceipt(
        number,
        file,
        String(form.get("note") ?? ""),
        String(form.get("reference") ?? ""),
      ),
    );
    revalidatePath(`/${locale}/orders/${number}/pay`);
    return { ok: true };
  });
}
export async function profileAction(locale: string, form: FormData) {
  return safe(async () => {
    const customer = await currentCustomer();
    if (!customer) throw new CommerceError("LOGIN_REQUIRED");
    const data = z
      .object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        phone: z.string().max(30),
        locale: localeSchema,
        preferredMarketId: z.string().min(1),
        birthDate: z.string().default(""),
        gender: z.string().max(30).default(""),
      })
      .parse(Object.fromEntries(form));
    if (
      !(await db.market.count({
        where: { id: data.preferredMarketId, isActive: true },
      }))
    )
      throw new CommerceError("VALIDATION");
    await withMutation(() =>
      db.customer.update({
        where: { id: customer.id },
        data: {
          ...data,
          birthDate: data.birthDate
            ? z.coerce.date().parse(data.birthDate)
            : null,
        },
      }),
    );
    revalidatePath(`/${locale}/account`);
    return { ok: true };
  });
}
export async function saveCustomerAddressAction(
  locale: string,
  form: FormData,
) {
  return safe(async () => {
    const customer = await currentCustomer();
    if (!customer) throw new CommerceError("LOGIN_REQUIRED");
    const a = addressSchema.parse({
      ...Object.fromEntries(form),
      email: customer.email,
      firstName: customer.firstName || "-",
      lastName: customer.lastName || "-",
    });
    await withMutation(() =>
      db.address.create({
        data: {
          customerId: customer.id,
          label: z.string().min(1).max(100).parse(form.get("label")),
          country: a.country,
          province: a.province,
          city: a.city,
          line1: a.line1,
          line2: a.line2,
          postalCode: a.postalCode,
          phone: a.phone,
        },
      }),
    );
    revalidatePath(`/${locale}/account`);
    return { ok: true };
  });
}
export async function deletionRequestAction(locale: string) {
  return safe(async () => {
    const customer = await currentCustomer();
    if (!customer) throw new CommerceError("LOGIN_REQUIRED");
    await withMutation(() =>
      db.customer.update({
        where: { id: customer.id },
        data: { deletionRequestedAt: new Date() },
      }),
    );
    revalidatePath(`/${locale}/account`);
    return { ok: true };
  });
}

export async function saveShippingAction(locale: string, form: FormData) {
  return safe(async () => {
    const l = localeSchema.parse(locale),
      cart = await readCart();
    if (!cart) throw new CommerceError("CART_EMPTY");
    const shippingRuleId = z
      .string()
      .max(100)
      .parse(form.get("shippingRuleId") ?? "");
    const address = addressSchema.parse(cart.checkout);
    await quoteCart({
      marketId: cart.marketId,
      locale: l,
      items: cart.items,
      address,
      shippingRuleId: shippingRuleId || undefined,
    });
    await withMutation(() => saveCheckout({ ...address, shippingRuleId }));
    return { url: `/${l}/checkout?step=3` };
  });
}
