import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { opaqueToken, tokenHash } from "@/lib/secure-tokens";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import { quoteCart } from "@/modules/fees";
import { CommerceError } from "@/modules/orders";
import { withMutation } from "@/lib/mutation-gate";

export const CART_COOKIE = "hoda.cart";
export async function readCart() {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await db.cart.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      items: {
        include: {
          variant: { include: { product: true, color: true, size: true } },
        },
      },
      market: true,
    },
  });
  if (!cart || cart.completedAt || cart.expiresAt <= new Date()) return null;
  if (cart.customerId && cart.customerId !== (await currentCustomer())?.id)
    return null;
  return cart;
}
export async function changeCart(
  locale: "fa" | "tr" | "en",
  variantId: string,
  quantity: number,
  add = false,
) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100)
    throw new CommerceError("INVALID_QUANTITY");
  return withMutation(async () => {
    const { market } = await getRequestContext(locale),
      customer = await currentCustomer();
    let cart = await readCart();
    if (cart && cart.marketId !== market.id)
      throw new CommerceError("MARKET_CHANGED");
    if (!cart) {
      const token = opaqueToken();
      const created = await db.cart.create({
        data: {
          tokenHash: tokenHash(token),
          customerId: customer?.id,
          marketId: market.id,
          locale,
          currency: market.currency,
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
      (await cookies()).set(CART_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: (process.env.APP_URL ?? "").startsWith("https:"),
        path: "/",
        maxAge: 30 * 86400,
      });
      cart = await db.cart.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          items: {
            include: {
              variant: { include: { product: true, color: true, size: true } },
            },
          },
          market: true,
        },
      });
    }
    const cartId = cart.id;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cart" WHERE id=${cartId} FOR UPDATE`;
      const latest = await tx.cart.findUniqueOrThrow({
        where: { id: cartId },
        include: { items: true },
      });
      if (latest.completedAt) throw new CommerceError("CART_COMPLETED");
      const old = latest.items.find((i) => i.variantId === variantId),
        next = add ? (old?.quantity ?? 0) + quantity : quantity;
      if (next > 100) throw new CommerceError("INVALID_QUANTITY");
      const proposed = latest.items
        .filter((i) => i.variantId !== variantId)
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      if (next) proposed.push({ variantId, quantity: next });
      if (proposed.length > 100) throw new CommerceError("CART_LIMIT");
      if (proposed.length)
        await quoteCart({ marketId: latest.marketId, locale, items: proposed });
      if (next)
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId, variantId } },
          create: { cartId, variantId, quantity: next },
          update: { quantity: next },
        });
      else await tx.cartItem.deleteMany({ where: { cartId, variantId } });
      await tx.cart.update({
        where: { id: cartId },
        data: { revision: { increment: 1 } },
      });
    });
  });
}
export async function changeCartMarket(locale: "fa" | "tr" | "en") {
  return withMutation(async () => {
    const cart = await readCart();
    if (!cart) return;
    const { market } = await getRequestContext(locale);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cart" WHERE id=${cart.id} FOR UPDATE`;
      const latest = await tx.cart.findUniqueOrThrow({
        where: { id: cart.id },
        include: { items: true },
      });
      if (latest.completedAt) throw new CommerceError("CART_COMPLETED");
      if (latest.items.length)
        await quoteCart({ marketId: market.id, locale, items: latest.items });
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          marketId: market.id,
          currency: market.currency,
          locale,
          checkout: {},
          revision: { increment: 1 },
        },
      });
    });
  });
}
export async function saveCheckout(data: Prisma.InputJsonObject) {
  const cart = await readCart();
  if (!cart) throw new CommerceError("CART_EMPTY");
  const changed = await db.cart.updateMany({
    where: { id: cart.id, completedAt: null },
    data: { checkout: data, revision: { increment: 1 } },
  });
  if (!changed.count) throw new CommerceError("CART_COMPLETED");
}
export async function mergeCustomerCart(customerId: string) {
  const jar = await cookies(),
    token = jar.get(CART_COOKIE)?.value;
  const restoredToken = opaqueToken();
  const restored = await withMutation(() =>
    db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart:${customerId}`}))`;
        const currentId = token
          ? (
              await tx.cart.findUnique({
                where: { tokenHash: tokenHash(token) },
                select: { id: true },
              })
            )?.id
          : undefined;
        let current = currentId
          ? await tx.cart.findUnique({
              where: { id: currentId },
              include: { items: true },
            })
          : null;
        if (
          !current ||
          current.completedAt ||
          current.expiresAt <= new Date() ||
          (current.customerId && current.customerId !== customerId)
        )
          current = null;
        const savedId = (
          await tx.cart.findFirst({
            where: {
              customerId,
              completedAt: null,
              expiresAt: { gt: new Date() },
              ...(current
                ? { marketId: current.marketId, id: { not: current.id } }
                : {}),
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          })
        )?.id;
        const ids = [
          ...(current ? [current.id] : []),
          ...(savedId ? [savedId] : []),
        ].sort();
        if (!ids.length) return false;
        await tx.$queryRaw`SELECT id FROM "Cart" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
        // Re-read under locks: checkout or a cart update may have completed while waiting.
        current = current
          ? await tx.cart.findUnique({
              where: { id: current.id },
              include: { items: true },
            })
          : null;
        if (
          current &&
          (current.completedAt ||
            current.expiresAt <= new Date() ||
            (current.customerId && current.customerId !== customerId))
        )
          current = null;
        let saved = savedId
          ? await tx.cart.findUnique({
              where: { id: savedId },
              include: { items: true },
            })
          : null;
        if (
          saved &&
          (saved.completedAt ||
            saved.expiresAt <= new Date() ||
            saved.customerId !== customerId ||
            (current && saved.marketId !== current.marketId))
        )
          saved = null;
        const target = current ?? saved;
        if (!target) return false;
        const quantities = new Map<string, number>();
        for (const item of [
          ...target.items,
          ...(current && saved ? saved.items : []),
        ])
          quantities.set(
            item.variantId,
            (quantities.get(item.variantId) ?? 0) + item.quantity,
          );
        const eligible = await tx.variant.findMany({
          where: {
            id: { in: [...quantities.keys()] },
            isActive: true,
            product: {
              status: "ACTIVE",
              deletedAt: null,
              marketIds: { has: target.marketId },
            },
          },
          select: { id: true },
        });
        const items = [];
        for (const variant of eligible.slice(0, 100)) {
          const stock = await tx.stockItem.aggregate({
            where: { variantId: variant.id },
            _sum: { onHand: true, reserved: true },
          });
          const quantity = Math.min(
            100,
            quantities.get(variant.id)!,
            Math.max(0, (stock._sum.onHand ?? 0) - (stock._sum.reserved ?? 0)),
          );
          if (quantity)
            items.push({ cartId: target.id, variantId: variant.id, quantity });
        }
        await tx.cartItem.deleteMany({ where: { cartId: target.id } });
        if (items.length) await tx.cartItem.createMany({ data: items });
        if (current && saved)
          await tx.cart.update({
            where: { id: saved.id },
            data: { completedAt: new Date() },
          });
        await tx.cart.update({
          where: { id: target.id },
          data: {
            customerId,
            revision: { increment: 1 },
            ...(!current ? { tokenHash: tokenHash(restoredToken) } : {}),
          },
        });
        return !current;
      },
      { timeout: 30000 },
    ),
  );
  if (restored)
    jar.set(CART_COOKIE, restoredToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.APP_URL ?? "").startsWith("https:"),
      path: "/",
      maxAge: 30 * 86400,
    });
}
