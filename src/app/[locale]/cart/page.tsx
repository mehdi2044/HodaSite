import { db } from "@/lib/db";
import { Iso } from "@/components/storefront/iso";
import { ResponsiveImage } from "@/components/storefront/responsive-image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { readCart } from "@/modules/cart";
import { quoteCart } from "@/modules/fees";
import { getRequestContext } from "@/lib/request-context";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { updateCartAction, switchCartAction } from "../commerce-actions";
export const dynamic = "force-dynamic";
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("commerce"),
    shopping = await getTranslations("shopping"),
    cart = await readCart(),
    { market } = await getRequestContext(locale);
  if (!cart?.items.length)
    return (
      <main className="shell shop-empty py-12">
        <h1 className="text-3xl font-semibold">{t("cart")}</h1>
        <p className="my-6 text-muted">{t("empty")}</p>
        <Link className="button" href={`/${locale}`}>
          {t("continueShopping")}
        </Link>
      </main>
    );
  const images = await db.productMedia.findMany({
    where: {
      productId: { in: cart.items.map((i) => i.variant.product.id) },
      media: { kind: "image", status: "READY", deletedAt: null },
    },
    include: { media: true },
    orderBy: { sortOrder: "asc" },
  });
  const mismatch = cart.marketId !== market.id;
  const quote = await quoteCart({
    marketId: cart.marketId,
    locale: locale as "fa" | "tr" | "en",
    items: cart.items,
  }).catch(() => null);
  return (
    <main className="shell shop-page grid gap-8 py-10">
      <h1 className="text-3xl font-semibold">
        {t("cart")} <span className="text-lg text-muted">{cart.currency}</span>
      </h1>
      {mismatch && (
        <section className="rounded-token border border-warning p-5">
          <p>{t("marketWarning")}</p>
          <CommerceForm action={switchCartAction.bind(null, locale)}>
            <button className="button mt-3">{t("requote")}</button>
          </CommerceForm>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="grid gap-4">
          {cart.items.map((item) => (
            <article
              key={item.id}
              className="shop-cart-item rounded-token border border-black/10 bg-surface p-5"
            >
              {images.find((m) => m.productId === item.variant.product.id) && (
                <ResponsiveImage
                  media={
                    images.find((m) => m.productId === item.variant.product.id)!
                      .media
                  }
                  locale={locale as "fa" | "tr" | "en"}
                  sizes="96px"
                  className="shop-cart-image"
                />
              )}
              <div className="shop-cart-item-body">
                <Link
                  className="text-lg font-semibold"
                  href={`/${locale}/p/${(item.variant.product.slugI18n as Record<string, string>)[locale]}`}
                >
                  {
                    (item.variant.product.titleI18n as Record<string, string>)[
                      locale
                    ]
                  }
                </Link>
                <p className="my-2 text-muted">
                  {
                    (item.variant.color.nameI18n as Record<string, string>)[
                      locale
                    ]
                  }{" "}
                  · <Iso>{item.variant.size.value}</Iso>
                  <br />
                  <small>
                    <Iso>{item.variant.sku}</Iso>
                  </small>
                </p>
                <CommerceForm
                  action={updateCartAction.bind(null, locale)}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input
                    type="hidden"
                    name="variantId"
                    value={item.variantId}
                  />
                  <label>
                    {t("quantity")}
                    <input
                      className="input ms-3 w-20"
                      type="number"
                      name="quantity"
                      min="1"
                      max="100"
                      defaultValue={item.quantity}
                    />
                  </label>
                  <button className="button">{t("update")}</button>
                </CommerceForm>
                <CommerceForm
                  action={updateCartAction.bind(null, locale)}
                  className="mt-2"
                >
                  <input
                    type="hidden"
                    name="variantId"
                    value={item.variantId}
                  />
                  <input type="hidden" name="quantity" value="0" />
                  <button className="shop-remove">{shopping("remove")}</button>
                </CommerceForm>
              </div>
            </article>
          ))}
        </section>
        <aside className="shop-order-summary h-fit rounded-token bg-surface p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">{shopping("summary")}</h2>
          {quote ? (
            <>
              <dl className="grid gap-3">
                <div className="flex justify-between">
                  <dt>{t("subtotal")}</dt>
                  <dd>
                    <Iso>
                      {quote.subtotal} {cart.currency}
                    </Iso>
                  </dd>
                </div>
                {quote.lines.map((line) => (
                  <div key={line.ruleId} className="flex justify-between gap-3">
                    <dt>{line.label}</dt>
                    <dd>
                      <Iso>
                        {line.chargedAmount} {cart.currency}
                      </Iso>
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-4 text-lg font-semibold">
                  <dt>{t("total")}</dt>
                  <dd>
                    <Iso>
                      {quote.total} {cart.currency}
                    </Iso>
                  </dd>
                </div>
              </dl>
              <p className="my-4 text-sm text-muted">{t("estimate")}</p>
              {!mismatch && (
                <Link
                  className="button block text-center"
                  href={`/${locale}/checkout`}
                >
                  {t("checkout")}
                </Link>
              )}
            </>
          ) : (
            <p role="alert">{t("errors.STOCK_UNAVAILABLE")}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
