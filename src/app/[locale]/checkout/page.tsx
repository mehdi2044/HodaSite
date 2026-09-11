import { provinces } from "@/modules/checkout/regions";
import Link from "next/link";
import { db } from "@/lib/db";
import { AddressForm } from "@/components/storefront/address-form";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readCart } from "@/modules/cart";
import { addressSchema } from "@/modules/checkout";
import { currentCustomer } from "@/modules/customers";
import { quoteCart } from "@/modules/fees";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { placeOrderAction, saveShippingAction } from "../commerce-actions";
export const dynamic = "force-dynamic";
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("commerce"),
    cart = await readCart(),
    customer = await currentCustomer();
  if (!cart?.items.length) redirect(`/${locale}/cart`);
  const settings = await db.siteSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  if (
    !customer &&
    (settings.checkout as { guestCheckout?: boolean }).guestCheckout === false
  )
    redirect(`/${locale}/account/login?next=/${locale}/checkout`);
  const terms = await db.page.findFirst({
    where: {
      id:
        (settings.checkout as { termsPageId?: string }).termsPageId ??
        "seed-page-terms",
      status: "published",
      OR: [
        { marketIds: { isEmpty: true } },
        { marketIds: { has: cart.marketId } },
      ],
      deletedAt: null,
    },
  });
  const termsSlug = terms
    ? (terms.slugI18n as Record<string, string>)[locale]
    : null;
  const step = Math.min(3, Math.max(1, Number((await searchParams).step) || 1)),
    draft = cart.checkout as Record<string, string>;
  const parsed = addressSchema.safeParse(draft);
  if (step > 1 && !parsed.success) redirect(`/${locale}/checkout`);
  return (
    <main className="shell max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">{t("checkout")}</h1>
      <ol className="my-8 flex justify-between gap-3">
        {["contact", "review", "payment"].map((key, i) => (
          <li
            key={key}
            aria-current={step === i + 1 ? "step" : undefined}
            className={
              step === i + 1 ? "font-semibold text-primary" : "text-muted"
            }
          >
            {i + 1}. {t(key)}
          </li>
        ))}
      </ol>
      <section className="rounded-token border border-black/10 bg-surface p-6">
        {step === 1 ? (
          <>
            <p className="mb-5">
              {customer ? (
                customer.email
              ) : (
                <Link
                  className="underline"
                  href={`/${locale}/account/login?next=/${locale}/checkout`}
                >
                  {t("guestOrLogin")}
                </Link>
              )}
            </p>
            <AddressForm locale={locale}>
              <input type="hidden" name="country" value={cart.market.code} />
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "firstName",
                  "lastName",
                  "email",
                  "phone",
                  "province",
                  "city",
                  "line1",
                  "line2",
                  "postalCode",
                  "birthDate",
                  "gender",
                ].map((key) => (
                  <label key={key}>
                    {t(key)}
                    <input
                      className="input mt-2 w-full"
                      name={key}
                      list={
                        key === "province" ? "checkout-provinces" : undefined
                      }
                      type={
                        key === "email"
                          ? "email"
                          : key === "birthDate"
                            ? "date"
                            : "text"
                      }
                      readOnly={key === "email" && !!customer}
                      defaultValue={
                        key === "email" && customer
                          ? customer.email
                          : (draft[key] ??
                            (
                              customer as unknown as Record<
                                string,
                                string
                              > | null
                            )?.[key] ??
                            "")
                      }
                      required={[
                        "firstName",
                        "lastName",
                        "email",
                        "phone",
                        "province",
                        "city",
                        "line1",
                      ].includes(key)}
                    />
                  </label>
                ))}
              </div>
              <datalist id="checkout-provinces">
                {(provinces[cart.market.code] ?? []).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <label>
                {t("note")}
                <textarea
                  className="input mt-2 w-full"
                  name="note"
                  defaultValue={draft.note}
                />
              </label>
              <button className="button">{t("next")}</button>
            </AddressForm>
          </>
        ) : step === 2 ? (
          <>
            <h2 className="mb-4 text-xl">{t("review")}</h2>
            <QuoteSummary cart={cart} address={parsed.data!} locale={locale} />
            <p className="my-5 text-muted">
              {draft.line1} · {draft.city} · {draft.province}
            </p>
            <div className="flex gap-3">
              <ShippingSelection cart={cart} locale={locale} />
              <Link
                className="px-4 py-3 underline"
                href={`/${locale}/checkout`}
              >
                {t("edit")}
              </Link>
            </div>
          </>
        ) : (
          <CommerceForm action={placeOrderAction.bind(null, locale)}>
            <h2 className="text-xl font-semibold">{t("bankTransfer")}</h2>
            <p>{t("paymentIntro")}</p>
            <QuoteSummary
              cart={cart}
              address={parsed.data!}
              locale={locale}
              confirm
            />
            <input
              type="hidden"
              name="address"
              value={JSON.stringify(parsed.data)}
            />
            <input type="hidden" name="revision" value={cart.revision} />
            {customer && (
              <label className="flex items-center gap-3">
                <input type="checkbox" name="useCredit" />
                <span>{(await getTranslations("returns"))("useCredit")}</span>
              </label>
            )}

            <label className="flex items-center gap-3">
              <input type="checkbox" name="terms" required />
              <span>
                {t("acceptTerms")}{" "}
                <Link
                  className="underline"
                  href={
                    termsSlug ? `/${locale}/pages/${termsSlug}` : `/${locale}`
                  }
                >
                  {t("terms")}
                </Link>
              </span>
            </label>
            {!termsSlug && <p role="alert">{t("errors.TERMS_REQUIRED")}</p>}
            <button className="button" disabled={!termsSlug}>
              {t("placeOrder")}
            </button>
          </CommerceForm>
        )}
      </section>
    </main>
  );
}
async function QuoteSummary({
  cart,
  address,
  locale,
  confirm = false,
}: {
  confirm?: boolean;
  cart: NonNullable<Awaited<ReturnType<typeof readCart>>>;
  address: { province: string; city: string; postalCode: string };
  locale: string;
}) {
  const t = await getTranslations("commerce"),
    quote = await quoteCart({
      marketId: cart.marketId,
      locale: locale as "fa" | "tr" | "en",
      items: cart.items,
      shippingRuleId:
        (cart.checkout as Record<string, string>).shippingRuleId || undefined,
      address,
    }).catch(() => null);
  if (!quote) return <p role="alert">{t("errors.STOCK_UNAVAILABLE")}</p>;
  return (
    <dl className="grid gap-3">
      {confirm && (
        <input type="hidden" name="expectedTotal" value={quote.total} />
      )}
      <div className="flex justify-between">
        <dt>{t("subtotal")}</dt>
        <dd>
          {quote.subtotal} {cart.currency}
        </dd>
      </div>
      {quote.lines.map((l) => (
        <div className="flex justify-between" key={l.ruleId}>
          <dt>{l.label}</dt>
          <dd>
            {l.chargedAmount} {cart.currency}
          </dd>
        </div>
      ))}
      <div className="flex justify-between border-t pt-3 text-lg font-semibold">
        <dt>{t("total")}</dt>
        <dd>
          {quote.total} {cart.currency}
        </dd>
      </div>
    </dl>
  );
}

async function ShippingSelection({
  cart,
  locale,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof readCart>>>;
  locale: string;
}) {
  const t = await getTranslations("commerce");
  const quote = await quoteCart({
    marketId: cart.marketId,
    locale: locale as "fa" | "tr" | "en",
    items: cart.items,
    address: addressSchema.parse(cart.checkout),
  }).catch(() => null);
  if (!quote) return null;
  return (
    <CommerceForm action={saveShippingAction.bind(null, locale)}>
      {quote.shippingOptions.length > 0 && (
        <label>
          {t("shippingMethod")}
          <select
            className="input ms-3"
            name="shippingRuleId"
            defaultValue={
              (cart.checkout as Record<string, string>).shippingRuleId ??
              quote.lines.find((l) => l.type === "SHIPPING")?.ruleId
            }
          >
            <option value="">{t("standardShipping")}</option>
            {quote.shippingOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="button">{t("next")}</button>
    </CommerceForm>
  );
}
