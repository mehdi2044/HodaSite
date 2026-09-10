import Link from "next/link";
import { readCart } from "@/modules/cart";
import { CartDrawer } from "./cart-drawer";
import { db } from "@/lib/db";
import type { Market } from "@/lib/request-context";
import { LocaleSwitcher } from "./locale-switcher";
import { MarketSwitcher } from "./market-switcher";
import { ResponsiveImage } from "./responsive-image";
import { getMenu, type PublicMenuItem } from "@/modules/content";
import { getTranslations } from "next-intl/server";

export async function Header({
  locale,
  market,
  markets,
  siteName,
  logoMediaId,
  headerStyle,
}: {
  locale: string;
  market: Market;
  markets: Market[];
  siteName: string;
  logoMediaId?: string | null;
  headerStyle: string;
}) {
  const normalizedLocale = locale as "fa" | "tr" | "en";
  const [logo, desktopMenu, mobileMenu, t] = await Promise.all([
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
    getMenu("header", market.id, market.code, normalizedLocale),
    getMenu("mobile", market.id, market.code, normalizedLocale),
    getTranslations(),
  ]);

  const cart = await readCart();
  return (
    <header
      data-header-style={headerStyle}
      className="sticky top-0 z-40 border-b border-black/5 bg-bg/95 backdrop-blur-md"
    >
      <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <Link
          href={`/${locale}`}
          className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight text-text"
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
              locale={locale as "fa" | "tr" | "en"}
              sizes="120px"
              priority
              className="h-8"
              imgClassName="h-8 w-auto object-contain"
            />
          ) : (
            siteName
          )}
        </Link>
        <nav
          aria-label={t("contentNavigation.main")}
          className="hidden items-center gap-5 md:flex"
        >
          {desktopMenu.map((item) => (
            <MenuLink
              key={item.id}
              item={item}
              placeholderLabel={t("contentNavigation.phase02Placeholder")}
            />
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <CartDrawer
            locale={locale}
            currency={cart?.currency ?? market.currency}
            items={
              cart?.items.map((i) => ({
                title:
                  (i.variant.product.titleI18n as Record<string, string>)[
                    locale
                  ] ?? "",
                quantity: i.quantity,
              })) ?? []
            }
          />
          <Link className="min-h-11 py-3" href={`/${locale}/account`}>
            {t("commerce.account")}
          </Link>
          <LocaleSwitcher
            current={locale}
            enabledLocales={market.enabledLocales}
            ariaLabel={t("locale.switchTo")}
          />
          <MarketSwitcher
            current={market.code}
            markets={markets}
            ariaLabel={t("market.chooseMarket")}
          />
          <details className="relative md:hidden">
            <summary
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full border border-black/10 bg-surface shadow-sm"
              aria-label={t("contentNavigation.mobile")}
            >
              ☰
            </summary>
            <nav
              className="absolute end-0 top-14 z-30 grid min-w-72 gap-1 rounded-token border border-black/5 bg-surface p-3 shadow-2xl"
              aria-label={t("contentNavigation.mobile")}
            >
              {(mobileMenu.length ? mobileMenu : desktopMenu).map((item) => (
                <MenuLink
                  key={item.id}
                  item={item}
                  mobile
                  placeholderLabel={t("contentNavigation.phase02Placeholder")}
                />
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  item,
  mobile = false,
  placeholderLabel,
}: {
  item: PublicMenuItem;
  mobile?: boolean;
  placeholderLabel: string;
}) {
  if (item.placeholder)
    return (
      <span
        className="min-h-11 px-3 py-3 text-muted"
        aria-disabled="true"
        title={placeholderLabel}
      >
        {item.label}
      </span>
    );
  return (
    <div className={mobile ? "grid" : "group relative"}>
      <Link
        className="flex min-h-11 items-center px-2"
        href={item.href ?? "#"}
        target={item.target}
        rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
      >
        {item.label}
      </Link>
      {item.children.length > 0 && (
        <div
          className={
            mobile
              ? "ms-4 grid"
              : "invisible absolute start-0 top-full z-20 grid min-w-48 rounded-token bg-surface p-2 opacity-0 shadow-xl group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          }
        >
          {item.children.map((child) => (
            <MenuLink
              key={child.id}
              item={child}
              mobile
              placeholderLabel={placeholderLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
