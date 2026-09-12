import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductOptions } from "@/components/storefront/product-options";
import { ProductPrice } from "@/components/storefront/product-price";
import { RecentlyViewed } from "@/components/storefront/recently-viewed";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductCard } from "@/components/storefront/product-card";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { getRequestContext } from "@/lib/request-context";
import { db } from "@/lib/db";
import {
  catalogText,
  findProductBySlug,
  formatCatalogCurrency,
  listCatalogProducts,
  type CatalogLocale,
} from "@/modules/catalog";
import { getDisplayPrice } from "@/modules/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const safe = locale as CatalogLocale;
  const { market } = await getRequestContext(locale);
  const product = await findProductBySlug(market.id, safe, slug);
  if (!product) return {};
  const seo = product.seoI18n as {
    title?: unknown;
    description?: unknown;
    ogMediaId?: string;
  };
  const og = seo.ogMediaId
    ? await db.media.findFirst({
        where: {
          id: seo.ogMediaId,
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
        select: { url: true },
      })
    : null;
  return {
    title: catalogText(seo.title, safe) || catalogText(product.titleI18n, safe),
    description:
      catalogText(seo.description, safe) ||
      catalogText(product.descriptionI18n, safe),
    openGraph: og ? { images: [og.url] } : undefined,
    alternates: {
      languages: Object.fromEntries(
        (["fa", "tr", "en"] as const).map((item) => [
          item,
          `/${item}/p/${encodeURIComponent(catalogText(product.slugI18n, item))}`,
        ]),
      ),
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { locale, slug } = await params;
  const previewRequested = (await searchParams).preview === "1";
  const session = previewRequested ? await auth() : null;
  const previewAllowed = Boolean(
    session?.user?.id && (await can(session.user.id, "catalog.product.view")),
  );
  const safe = locale as CatalogLocale;
  const [{ market }, t] = await Promise.all([
    getRequestContext(locale),
    getTranslations("catalog"),
  ]);
  const product = await findProductBySlug(market.id, safe, slug, {
    includeInactive: previewRequested && previewAllowed,
  });
  if (!product) notFound();
  const [basePrice, related, guides, siteSettings] = await Promise.all([
    getDisplayPrice(product, null, market),
    listCatalogProducts(market.id, safe, {
      categoryId: product.categoryId,
      limit: 4,
    }),
    db.sizeGuide.findMany({
      where: {
        deletedAt: null,
        OR: [
          { scope: "product", refId: product.id },
          ...(product.brandId
            ? [{ scope: "brand", refId: product.brandId }]
            : []),
          { scope: "category", refId: product.categoryId },
        ],
      },
    }),
    db.siteSettings.findUniqueOrThrow({
      where: { id: "default" },
      select: { inventory: true },
    }),
  ]);
  const inventorySettings = siteSettings.inventory as {
    lowStockThreshold?: unknown;
  };
  const globalLowStockThreshold =
    typeof inventorySettings.lowStockThreshold === "number"
      ? inventorySettings.lowStockThreshold
      : 2;
  const guide =
    guides.find((item) => item.scope === "product") ??
    guides.find((item) => item.scope === "brand") ??
    guides.find((item) => item.scope === "category");
  const currency = (
    ["IRT", "TRY", "CAD", "USD"].includes(market.currency)
      ? market.currency
      : "USD"
  ) as "IRT" | "TRY" | "CAD" | "USD";
  const variantPrices = new Map(
    await Promise.all(
      product.variants.map(
        async (variant) =>
          [
            variant.id,
            await getDisplayPrice(product, variant, market),
          ] as const,
      ),
    ),
  );
  const variantDisplayPrices = new Map(
    [...variantPrices].map(([id, price]) => [
      id,
      formatCatalogCurrency(price.amount, currency, safe),
    ]),
  );
  const amount = basePrice.amount;
  const compareAmount = basePrice.compareAtAmount;
  const hasStock = product.variants.some((variant) =>
    variant.stockItems.some((stock) => stock.onHand - stock.reserved > 0),
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: catalogText(product.titleI18n, safe),
        sku: product.variants[0]?.sku,
        image: product.media.map((x) => x.media.url),
        offers: {
          "@type": "Offer",
          priceCurrency: currency,
          price: amount,
          availability: hasStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: catalogText(product.category.titleI18n, safe),
            item: `/${safe}/c/${encodeURIComponent(catalogText(product.category.slugI18n, safe))}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: catalogText(product.titleI18n, safe),
          },
        ],
      },
    ],
  };
  const guideTable = guide?.tableI18n as
    { columns?: string[]; rows?: string[][] } | undefined;
  return (
    <main
      className="shell shop-page py-10 md:py-16"
      dir={safe === "fa" ? "rtl" : "ltr"}
    >
      <RecentlyViewed productId={product.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <nav
        className="mb-7 flex flex-wrap gap-2 text-sm text-muted"
        aria-label={t("breadcrumbs")}
      >
        <Link href={`/${safe}`}>{t("home")}</Link>
        <span>/</span>
        <Link
          href={`/${safe}/c/${encodeURIComponent(catalogText(product.category.slugI18n, safe))}`}
        >
          {catalogText(product.category.titleI18n, safe)}
        </Link>
        <span>/</span>
        <span>{catalogText(product.titleI18n, safe)}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery
          base={product.media.map((item) => ({
            id: item.id,
            media: item.media,
          }))}
          variants={product.variants.map((variant) => ({
            colorId: variant.colorId,
            media: variant.media.map((item) => ({
              id: item.id,
              media: item.media,
            })),
          }))}
          locale={safe}
        />
        <section>
          <p className="text-sm text-muted">
            {product.brand ? catalogText(product.brand.nameI18n, safe) : ""}
          </p>
          <h1 className="shop-product-title mt-2 text-4xl font-semibold">
            {catalogText(product.titleI18n, safe)}
          </h1>
          <ProductPrice
            initial={
              variantDisplayPrices.get(
                product.variants.find((variant) => variant.isActive)?.id ?? "",
              ) ?? formatCatalogCurrency(amount, currency, safe)
            }
            compare={
              compareAmount
                ? formatCatalogCurrency(compareAmount, currency, safe)
                : undefined
            }
          />
          <p className="mt-1 text-sm text-muted">
            {market.priceIncludesTax ? t("taxIncluded") : t("taxExcluded")}
          </p>
          <div className="mt-3 flex gap-2">
            {Date.now() - product.createdAt.getTime() < 30 * 86400000 && (
              <span className="rounded-full bg-text px-3 py-1 text-xs text-bg">
                {t("newBadge")}
              </span>
            )}
            {compareAmount && (
              <span className="rounded-full bg-primary px-3 py-1 text-xs text-white">
                {t("saleBadge")}
              </span>
            )}
          </div>
          <p className="my-7 whitespace-pre-wrap leading-8 text-muted">
            {catalogText(product.descriptionI18n, safe)}
          </p>
          <div className="storefront-purchase sticky bottom-3 z-10 rounded-token bg-bg/95 p-3 shadow-xl backdrop-blur">
            <ProductOptions
              variants={product.variants.map((v) => ({
                id: v.id,
                colorId: v.colorId,
                sizeId: v.sizeId,
                sku: v.sku,
                isActive: v.isActive,
                available: v.stockItems.reduce(
                  (total, stock) => total + stock.onHand - stock.reserved,
                  0,
                ),
                lowStockThreshold: Math.max(
                  0,
                  ...v.stockItems.map(
                    (stock) =>
                      stock.lowStockThreshold ?? globalLowStockThreshold,
                  ),
                ),
                price:
                  variantDisplayPrices.get(v.id) ??
                  formatCatalogCurrency(amount, currency, safe),
                color: {
                  hex: v.color.hex,
                  name: catalogText(v.color.nameI18n, safe),
                },
                size: { value: v.size.value },
              }))}
              labels={{
                color: t("color"),
                size: t("size"),
                add: t("addToCart"),
                stub: t("cartStub"),
                inStock: t("inStock"),
                lowStock: t("lowStock"),
                outOfStock: t("outOfStock"),
              }}
              basePrice={formatCatalogCurrency(amount, currency, safe)}
            />
          </div>
          <details className="mt-7 border-t pt-5">
            <summary className="cursor-pointer font-medium">
              {t("sizeGuide")}
            </summary>
            {guideTable?.columns && guideTable.rows ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {guideTable.columns.map((column) => (
                        <th key={column} className="border p-2">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {guideTable.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((value, cell) => (
                          <td key={cell} className="border p-2 text-center">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-sm text-muted">{guide?.unit}</p>
              </div>
            ) : (
              <p className="mt-3 text-muted">{t("noSizeGuide")}</p>
            )}
          </details>
          <details className="mt-5 border-t pt-5">
            <summary className="cursor-pointer font-medium">
              {t("care")}
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-muted">
              {catalogText(product.careI18n, safe)}
            </p>
          </details>
          <p className="mt-5 border-t pt-5 text-sm">
            <Link
              className="underline"
              href={`/${safe}/pages/${safe === "fa" ? "بازگشت-کالا" : safe === "tr" ? "iade" : "returns"}`}
            >
              {t("shippingReturns")}
            </Link>
          </p>
          {product.attributes.length > 0 && (
            <dl className="mt-7 grid grid-cols-2 gap-3 border-t pt-5">
              {product.attributes.map((x) => (
                <div key={x.id}>
                  <dt className="text-sm text-muted">{x.key}</dt>
                  <dd>{catalogText(x.valueI18n, safe)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
      <section className="mt-20">
        <h2 className="text-3xl font-semibold">{t("related")}</h2>
        <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-4">
          {related.items
            .filter((x) => x.id !== product.id)
            .slice(0, 4)
            .map((x) => (
              <ProductCard
                key={x.id}
                product={x}
                locale={safe}
                market={market}
              />
            ))}
        </div>
      </section>
    </main>
  );
}
