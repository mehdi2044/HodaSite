import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getRequestContext } from "@/lib/request-context";
import { withMutation } from "@/lib/mutation-gate";
import { currentCustomer } from "@/modules/customers";
import { tokenHash } from "@/lib/secure-tokens";
import { quoteCart } from "@/modules/fees";
import { getActiveRate } from "@/modules/pricing";
import { reserveOrderInventory } from "@/modules/inventory";
import { queueEmail } from "@/modules/notifications";
import { CART_COOKIE } from "@/modules/cart";
import { CommerceError } from "@/modules/orders";
import { addressSchema, type CheckoutAddress } from "./validation";
export { addressSchema, localeSchema } from "./validation";
export type { CheckoutAddress } from "./validation";

export async function placeOrder(
  raw: CheckoutAddress,
  acceptedTerms: boolean,
  expectedRevision: number,
  expectedTotal?: string,
) {
  const address = addressSchema.parse(raw);
  if (!acceptedTerms) throw new CommerceError("TERMS_REQUIRED");
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) throw new CommerceError("CART_EMPTY");
  const customer = await currentCustomer();
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        const hash = tokenHash(token);
        await tx.$queryRaw`SELECT id FROM "Cart" WHERE "tokenHash"=${hash} FOR UPDATE`;
        const cart = await tx.cart.findUniqueOrThrow({
          where: { tokenHash: hash },
          include: {
            items: {
              include: {
                variant: {
                  include: { product: true, color: true, size: true },
                },
              },
            },
            market: true,
            order: true,
          },
        });
        if (cart.customerId && cart.customerId !== customer?.id)
          throw new CommerceError("FORBIDDEN");
        if (cart.order)
          return { number: cart.order.number, locale: cart.order.locale };
        if (
          cart.completedAt ||
          cart.expiresAt <= new Date() ||
          !cart.items.length
        )
          throw new CommerceError("CART_EMPTY");
        if (cart.revision !== expectedRevision)
          throw new CommerceError("CART_CHANGED");
        if (address.country !== cart.market.code)
          throw new CommerceError("ADDRESS_MARKET");
        if (customer && address.email !== customer.email)
          throw new CommerceError("EMAIL_MISMATCH");
        const settings = await tx.siteSettings.findUnique({
          where: { id: "default" },
        });
        const checkoutSettings = settings?.checkout as { termsPageId?: string };
        const terms = await tx.page.findFirst({
          where: {
            id: checkoutSettings?.termsPageId ?? "seed-page-terms",
            status: "published",
            OR: [
              { marketIds: { isEmpty: true } },
              { marketIds: { has: cart.marketId } },
            ],
            deletedAt: null,
          },
        });
        if (!terms) throw new CommerceError("TERMS_REQUIRED");
        if (
          !customer &&
          (settings?.checkout as { guestCheckout?: boolean })?.guestCheckout ===
            false
        )
          throw new CommerceError("LOGIN_REQUIRED");
        if (
          !cart.market.isActive ||
          cart.market.salesPaused ||
          !cart.market.paymentMethods.includes("OFFLINE_BANK_TRANSFER")
        )
          throw new CommerceError("MARKET_UNAVAILABLE");
        const banks = await tx.marketBankAccount.findMany({
          where: { marketId: cart.marketId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });
        if (!banks.length) throw new CommerceError("PAYMENT_UNAVAILABLE");
        const locale = cart.locale as "fa" | "tr" | "en";
        if ((await getRequestContext(locale)).market.id !== cart.marketId)
          throw new CommerceError("MARKET_CHANGED");
        const quote = await quoteCart({
          marketId: cart.marketId,
          locale,
          items: cart.items,
          shippingRuleId:
            (cart.checkout as Record<string, string>).shippingRuleId ||
            undefined,
          address,
        });
        if (
          expectedTotal !== undefined &&
          !new Decimal(expectedTotal).eq(quote.total)
        )
          throw new CommerceError("PRICE_CHANGED");
        const rates = new Set(quote.items.map((i) => i.fxRate));
        if (rates.size !== 1) throw new CommerceError("PRICE_CHANGED");
        const marketRate = quote.items[0].fxRate;
        const tryMarket = await tx.market.findFirstOrThrow({
          where: { currency: "TRY" },
        });
        const tryRate =
          cart.market.currency === "TRY"
            ? marketRate
            : (await getActiveRate(tryMarket)).rate;
        const now = new Date(),
          holdUntil = new Date(now.getTime() + cart.market.holdHours * 3600000),
          deadline = new Date(
            now.getTime() + cart.market.paymentDeadlineHours * 3600000,
          );
        const owner =
          customer ??
          (await tx.customer.upsert({
            where: { email: address.email },
            create: {
              email: address.email,
              firstName: address.firstName,
              lastName: address.lastName,
              phone: address.phone,
              locale,
              isGuest: true,
            },
            update: {},
          }));
        const sequence = await tx.orderSequence.upsert({
          where: { id: cart.marketId },
          create: { id: cart.marketId, value: 100001 },
          update: { value: { increment: 1 } },
        });
        const total = new Decimal(quote.total),
          usd = total.div(marketRate);
        const rules = await tx.feeRule.findMany({
          where: { id: { in: quote.lines.map((l) => l.ruleId) } },
        });
        const order = await tx.order.create({
          data: {
            number: `${cart.market.code}-${sequence.value}`,
            cartId: cart.id,
            marketId: cart.marketId,
            customerId: owner.id,
            guestTokenHash: hash,
            locale,
            currency: quote.currency,
            subtotalAmount: quote.subtotal,
            feeTotalAmount: total.sub(quote.subtotal).toFixed(),
            totalAmount: total.toFixed(),
            totalAmountTry: usd.mul(tryRate).toDecimalPlaces(4).toFixed(),
            totalAmountUsd: usd.toDecimalPlaces(4).toFixed(),
            fxSnapshot: {
              marketPerUsd: marketRate,
              tryPerUsd: tryRate,
              quotedAt: quote.quotedAt,
              terms: {
                pageId: terms.id,
                updatedAt: terms.updatedAt.toISOString(),
                acceptedAt: now.toISOString(),
              },
            },
            bankSnapshot: JSON.parse(JSON.stringify(banks)),
            contactSnapshot: {
              firstName: address.firstName,
              lastName: address.lastName,
              email: address.email,
              phone: address.phone,
            },
            shippingAddress: address,
            billingAddress: address,
            customerNote: address.note,
            holdExpiresAt: holdUntil,
            paymentDeadlineAt: deadline,
            items: {
              create: quote.items.map((item) => {
                const v = cart.items.find(
                  (i) => i.variantId === item.variantId,
                )!.variant;
                return {
                  variantId: v.id,
                  productSnapshot: {
                    title: v.product.titleI18n,
                    sku: v.sku,
                    color: v.color.nameI18n,
                    size: v.size.value,
                  },
                  unitPriceAmount: item.unitPrice,
                  quantity: item.quantity,
                  lineTotalAmount: new Decimal(item.unitPrice)
                    .mul(item.quantity)
                    .toFixed(),
                  currency: quote.currency,
                  weightGrams: item.weightGrams,
                };
              }),
            },
            fees: {
              create: quote.lines.map((line) => ({
                type: line.type,
                label: line.label,
                ruleId: line.ruleId,
                amount: line.amount,
                currency: quote.currency,
                absorbed: line.absorbed,
                ruleSnapshot: JSON.parse(
                  JSON.stringify(rules.find((r) => r.id === line.ruleId) ?? {}),
                ),
              })),
            },
            payments: {
              create: {
                amount: quote.total,
                currency: quote.currency,
                bankAccountId: banks[0].id,
              },
            },
            events: { create: { type: "placed", toStatus: "PENDING_PAYMENT" } },
          },
        });
        await reserveOrderInventory(
          tx,
          order.id,
          cart.items,
          "HOLD",
          holdUntil,
        );
        await tx.cart.update({
          where: { id: cart.id },
          data: { completedAt: now },
        });
        const origin = process.env.APP_URL ?? process.env.AUTH_URL ?? "";
        await queueEmail(
          tx,
          "order.placed",
          address.email,
          locale,
          {
            customerName: address.firstName,
            orderNumber: order.number,
            total: `${quote.total} ${quote.currency}`,
            paymentUrl: `${origin}/${locale}/orders/${order.number}/pay`,
            holdUntil: holdUntil.toISOString(),
            deadline: deadline.toISOString(),
            bankDetails: banks
              .map(
                (b) =>
                  `${b.bankName}: ${b.iban || b.accountNumber || b.cardNumber}`,
              )
              .join("\n"),
          },
          cart.market.name,
        );
        return { number: order.number, locale };
      },
      { timeout: 30000 },
    ),
  );
}
