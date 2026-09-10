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
    cart = await readCart(),
    { market } = await getRequestContext(locale);
  if (!cart?.items.length)
    return (
      <main className="shell py-12">
        <h1 className="text-3xl font-semibold">{t("cart")}</h1>
        <p className="my-6 text-muted">{t("empty")}</p>
        <Link className="button" href={`/${locale}`}>
          {t("continueShopping")}
        </Link>
      </main>
    );
  const mismatch = cart.marketId !== market.id;
  const quote = await quoteCart({
    marketId: cart.marketId,
    locale: locale as "fa" | "tr" | "en",
    items: cart.items,
  }).catch(() => null);
  return (
    <main className="shell grid gap-8 py-10">
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
              className="rounded-token border border-black/10 bg-surface p-5"
            >
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
                {item.variant.sku} · {item.variant.size.value}
              </p>
              <CommerceForm
                action={updateCartAction.bind(null, locale)}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="variantId" value={item.variantId} />
                <label>
                  {t("quantity")}
                  <input
                    className="input ms-3 w-20"
                    type="number"
                    name="quantity"
                    min="0"
                    max="100"
                    defaultValue={item.quantity}
                  />
                </label>
                <button className="button">{t("update")}</button>
                <span className="text-sm text-muted">{t("removeHint")}</span>
              </CommerceForm>
            </article>
          ))}
        </section>
        <aside className="h-fit rounded-token bg-surface p-6 shadow-sm">
          {quote ? (
            <>
              <dl className="grid gap-3">
                <div className="flex justify-between">
                  <dt>{t("subtotal")}</dt>
                  <dd>
                    {quote.subtotal} {cart.currency}
                  </dd>
                </div>
                {quote.lines.map((line) => (
                  <div key={line.ruleId} className="flex justify-between gap-3">
                    <dt>{line.label}</dt>
                    <dd>
                      {line.chargedAmount} {cart.currency}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-4 text-lg font-semibold">
                  <dt>{t("total")}</dt>
                  <dd>
                    {quote.total} {cart.currency}
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
