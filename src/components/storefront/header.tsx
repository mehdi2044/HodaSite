import { variantImages } from "@/modules/catalog/variant-images";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { seoPath } from "@/lib/seo-urls";
import { localizedValue } from "@/modules/content/homepage";
import { MobileMenu } from "./mobile-menu";
import { MobileNavigation } from "./mobile-navigation";
import { StorefrontIcon } from "./storefront-icon";
import Link from "next/link";
import { readCart } from "@/modules/cart";
import { quoteSavedCart } from "@/modules/fees";
import { currentCustomer } from "@/modules/customers";
import { CartDrawer } from "./cart-drawer";
import { db } from "@/lib/db";
import type { Market } from "@/lib/request-context";
import { LocaleSwitcher } from "./locale-switcher";
import { MarketSwitcher } from "./market-switcher";
import { ResponsiveImage } from "./responsive-image";
import { getMenu, type PublicMenuItem } from "@/modules/content";
import { getTranslations } from "next-intl/server";
import { HeaderFrame } from "./header-frame";
import { HeaderSearch } from "./header-search";
import { MegaNavigation } from "./mega-navigation";

export async function Header({
  locale,
  market,
  markets,
  siteName,
  logoMediaId,
  headerStyle,
  logoWidth = 160,
}: {
  locale: string;
  market: Market;
  markets: Market[];
  siteName: string;
  logoMediaId?: string | null;
  headerStyle: string;
  logoWidth?: number;
}) {
  const safe = locale as "fa" | "tr" | "en";
  const [logo, desktopMenu, mobileMenu, t, departments, cart] =
    await Promise.all([
      logoMediaId
        ? db.media.findFirst({
            where: {
              id: logoMediaId,
              kind: "image",
              status: "READY",
              deletedAt: null,
            },
          })
        : null,
      getMenu("header", market.id, market.code, safe),
      getMenu("mobile", market.id, market.code, safe),
      getTranslations(),
      db.category.findMany({
        where: { deletedAt: null, parentId: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, titleI18n: true, slugI18n: true },
      }),
      readCart(),
    ]);
  const departmentItems: PublicMenuItem[] = departments.flatMap((category) => {
    const slug = localizedValue(
      category.slugI18n as Record<"fa" | "tr" | "en", string>,
      safe,
    );
    return slug
      ? [
          {
            id: `department-${category.id}`,
            label: localizedValue(
              category.titleI18n as Record<"fa" | "tr" | "en", string>,
              safe,
            ),
            href: seoPath(safe, market.code, "c", slug),
            target: "_self",
            placeholder: false,
            children: [],
          },
        ]
      : [];
  });
  const complete = (items: PublicMenuItem[]): PublicMenuItem[] => {
    const missing = departmentItems.filter(
      (category) => !items.some((item) => item.href === category.href),
    );
    // A disclosure bounds presentation size, never business category count.
    return [
      ...items,
      ...(missing.length > 6
        ? [
            {
              id: "all-categories",
              label: t("shopping.browseCategories"),
              target: "_self" as const,
              placeholder: true,
              children: missing,
            },
          ]
        : missing),
    ];
  };
  const images = await variantImages(
    cart?.items.slice(0, 5).map((item) => item.variant) ?? [],
  );
  const quote = cart?.items.length
    ? await quoteSavedCart(
        {
          marketId: cart.marketId,
          locale: safe,
          items: cart.items,
          promotions: {
            customerId: (await currentCustomer())?.id ?? null,
            couponCodes:
              (cart.checkout as Record<string, unknown>).couponCodes ?? [],
          },
        },
        cart.checkout,
      ).catch(() => null)
    : null;
  return (
    <>
      <HeaderFrame style={headerStyle}>
        <div className="moda-header-grid">
          <div
            className="moda-desktop-navigation"
            data-testid="department-navigation"
          >
            <MegaNavigation items={complete(desktopMenu)} locale={safe} />
          </div>
          <div className="moda-mobile-navigation">
            <MobileMenu label={t("contentNavigation.mobile")}>
              <MegaNavigation
                items={complete(mobileMenu.length ? mobileMenu : desktopMenu)}
                locale={safe}
                mobile
              />
              <div className="grid gap-3 border-t border-black/10 pt-4 mt-2">
                <span>{t("mobileStorefront.language")}</span>
                <LocaleSwitcher
                  current={locale}
                  enabledLocales={market.enabledLocales}
                  ariaLabel={t("mobileStorefront.language")}
                  mobile
                />
                <label>
                  {t("mobileStorefront.market")}
                  <MarketSwitcher
                    current={market.code}
                    markets={markets}
                    ariaLabel={t("mobileStorefront.market")}
                  />
                </label>
              </div>
            </MobileMenu>
          </div>
          <Link
            href={seoPath(safe, market.code, "home")}
            className="moda-brand"
            style={{ width: logoWidth }}
          >
            {logo ? (
              <ResponsiveImage
                media={{
                  url: logo.url,
                  variants: logo.variants,
                  width: logo.width,
                  height: logo.height,
                  blurDataUrl: logo.blurDataUrl,
                  altI18n: { fa: siteName, tr: siteName, en: siteName },
                }}
                locale={safe}
                sizes={`${logoWidth}px`}
                priority
                imgClassName="w-full h-auto max-h-12 object-contain"
              />
            ) : (
              <span>{siteName}</span>
            )}
          </Link>
          <div className="moda-header-tools">
            <HeaderSearch
              locale={safe}
              marketId={market.id}
              marketCode={market.code}
            />
            <Link
              href={`/${locale}/account/wishlist`}
              className="moda-tool"
              aria-label={t("engagement.wishlist")}
            >
              <span aria-hidden="true">♡</span>
            </Link>
            <Link
              href={`/${locale}/account`}
              className="moda-tool moda-account-tool"
              aria-label={t("commerce.account")}
            >
              <StorefrontIcon name="account" />
            </Link>
            <CartDrawer
              locale={locale}
              currency={quote?.currency ?? cart?.currency ?? market.currency}
              marketMismatch={Boolean(
                cart &&
                (cart.marketId !== market.id ||
                  (quote && quote.currency !== cart.currency)),
              )}
              subtotal={
                quote
                  ? formatStorefrontAmount(quote.subtotal, quote.currency, safe)
                  : undefined
              }
              total={
                quote
                  ? formatStorefrontAmount(quote.total, quote.currency, safe)
                  : undefined
              }
              quoteUnavailable={Boolean(cart?.items.length && !quote)}
              items={
                cart?.items.map((item) => ({
                  id: item.id,
                  title:
                    (item.variant.product.titleI18n as Record<string, string>)[
                      locale
                    ] ?? "",
                  quantity: item.quantity,
                  image: images.get(item.variantId),
                  color:
                    (item.variant.color.nameI18n as Record<string, string>)[
                      locale
                    ] ?? "",
                  size: item.variant.size.value,
                  price: quote?.items.find(
                    (line) => line.variantId === item.variantId,
                  )
                    ? formatStorefrontAmount(
                        quote.items.find(
                          (line) => line.variantId === item.variantId,
                        )!.unitPrice,
                        quote.currency,
                        safe,
                      )
                    : undefined,
                })) ?? []
              }
            />
          </div>
        </div>
      </HeaderFrame>
      <MobileNavigation
        locale={locale}
        labels={{
          navigation: t("mobileStorefront.navigation"),
          home: t("mobileStorefront.home"),
          search: t("catalog.search"),
          cart: t("commerce.cart"),
          account: t("commerce.account"),
        }}
      />
    </>
  );
}
