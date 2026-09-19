import { SpatialHero } from "./spatial-hero";
import { seoPath } from "@/lib/seo-urls";
import { getDisplayPrices } from "@/modules/pricing";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { storefrontHref } from "@/modules/content/storefront-links";
import { db } from "@/lib/db";
import { ResponsiveImage, isDemoFashionMedia } from "./responsive-image";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";
import { homepageProducts } from "@/modules/content/homepage-products";
import { ProductCard } from "./product-card";

type Locale = "fa" | "tr" | "en";

export async function HomepageBlocks({
  blocks,
  locale,
  market,
}: {
  blocks: HomepageBlock[];
  locale: Locale;
  market: {
    id: string;
    code: string;
    currency: string;
    markupPercent: { toString(): string };
    roundingRule: unknown;
  };
}) {
  const t = await getTranslations("shopping");
  const mediaIds = [
    ...new Set(
      blocks.flatMap((block) =>
        (block.type === "Hero" || block.type === "Banner") && block.mediaId
          ? [block.mediaId]
          : [],
      ),
    ),
  ];
  const [media, productRows, categories] = await Promise.all([
    mediaIds.length
      ? await db.media.findMany({
          where: {
            id: { in: mediaIds },
            kind: "image",
            status: "READY",
            deletedAt: null,
          },
        })
      : [],
    Promise.all(
      blocks.map((block) =>
        block.type === "ProductStrip"
          ? homepageProducts(market.id, locale, block.source)
          : Promise.resolve(null),
      ),
    ),
    db.category.findMany({
      where: { deletedAt: null, parentId: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 12,
      include: { media: true },
    }),
  ]);
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const prices = await getDisplayPrices(
    productRows.flatMap((rows) => rows?.items ?? []),
    market,
  );
  return (
    <main className="shop-homepage" dir={locale === "fa" ? "rtl" : "ltr"}>
      {blocks.map((block, index) => {
        if (
          block.type === "Hero" &&
          block.layout === "spatial" &&
          categories.length > 0
        )
          return (
            <SpatialHero
              key={index}
              block={block}
              departments={categories.slice(0, 4)}
              campaignImage={
                block.mediaId ? mediaById.get(block.mediaId) : undefined
              }
              locale={locale}
              marketCode={market.code}
              first={index === 0}
            />
          );
        if (block.type === "Hero" || block.type === "Banner") {
          const image = block.mediaId
            ? mediaById.get(block.mediaId)
            : undefined;
          return (
            <section
              key={index}
              className={`shop-hero ${image ? "shop-hero-with-image" : "shop-hero-text"} ${block.type === "Hero" ? "shop-editorial-hero" : ""}`}
              data-testid={
                block.type === "Hero" ? "storefront-hero" : undefined
              }
            >
              {image && (
                <ResponsiveImage
                  media={image}
                  locale={locale}
                  sizes="(min-width:1024px) 50vw, 100vw"
                  priority={index === 0}
                  role="hero"
                  className="shop-hero-image"
                />
              )}
              <div className="shell shop-hero-content">
                {isDemoFashionMedia(image) && (
                  <p className="shop-eyebrow">{t("collectionPreview")}</p>
                )}
                {block.type === "Hero" && index === 0 ? (
                  <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-7xl">
                    {localizedValue(block.title, locale)}
                  </h1>
                ) : (
                  <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                    {localizedValue(block.title, locale)}
                  </h2>
                )}
                <p className="mt-3 max-w-2xl text-lg">
                  {localizedValue(block.body, locale)}
                </p>
                {block.ctaUrl && localizedValue(block.ctaLabel, locale) && (
                  <Link
                    className="button mt-7 inline-flex w-fit items-center font-semibold shadow-lg"
                    href={storefrontHref(block.ctaUrl, locale)}
                  >
                    {localizedValue(block.ctaLabel, locale)}
                  </Link>
                )}
                {isDemoFashionMedia(image) && (
                  <span className="shop-demo-caption">{t("demoImage")}</span>
                )}
              </div>
            </section>
          );
        }
        if (block.type === "ProductStrip")
          return (
            <section
              key={index}
              className="shell shop-home-section"
              data-testid="home-product-strip"
            >
              <div className="shop-section-heading">
                <span className="shop-section-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  {localizedValue(block.title, locale)}
                </h2>
                {block.source.mode === "latest" && (
                  <Link
                    className="shop-section-link"
                    href={`/${locale}/search`}
                  >
                    {t("viewAll")}
                    <span aria-hidden="true">↗</span>
                  </Link>
                )}
              </div>
              {!productRows[index]?.items.length && (
                <p className="shop-inline-empty">{t("emptyCollection")}</p>
              )}
              <div className="shop-product-rail">
                {productRows[index]?.items
                  .slice(0, block.source.limit)
                  .map((product) => (
                    <ProductCard
                      key={product.id}
                      product={{
                        ...product,
                        displayPrice: prices.get(product.id),
                      }}
                      locale={locale}
                      market={market}
                    />
                  ))}
              </div>
            </section>
          );
        if (block.type === "CategoryCards")
          return (
            <section
              key={index}
              className="shell shop-home-section shop-category-section"
              data-testid="home-categories"
            >
              <div className="shop-section-heading">
                <span className="shop-section-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  {localizedValue(block.title, locale)}
                </h2>
              </div>
              {!categories.length && (
                <p className="shop-inline-empty">{t("emptyCategories")}</p>
              )}
              <div className="shop-category-grid">
                {categories
                  .slice(0, block.source.limit)
                  .map((category, categoryIndex) => (
                    <Link
                      key={category.id}
                      href={seoPath(
                        locale,
                        market.code,
                        "c",
                        localizedValue(
                          category.slugI18n as Record<Locale, string>,
                          locale,
                        ),
                      )}
                      className="shop-category-card group"
                    >
                      <div className="shop-category-plane">
                        {category.media &&
                          category.media.status === "READY" &&
                          !category.media.deletedAt && (
                            <ResponsiveImage
                              media={category.media}
                              locale={locale}
                              sizes="(max-width:640px) 50vw,25vw"
                              role="editorial"
                              className="shop-category-image"
                              imgClassName="h-full w-full object-cover"
                            />
                          )}
                      </div>
                      <h3 className="shop-category-name">
                        <span
                          className="shop-category-number"
                          aria-hidden="true"
                        >
                          {String(categoryIndex + 1).padStart(2, "0")}
                        </span>
                        <span>
                          {localizedValue(
                            category.titleI18n as Record<Locale, string>,
                            locale,
                          )}
                        </span>
                      </h3>
                    </Link>
                  ))}
              </div>
            </section>
          );
        if (block.type === "TrustBar")
          return (
            <section key={index} className="shop-service-strip">
              <div className="shell shop-service-grid">
                {block.items.map((item, itemIndex) => (
                  <p key={itemIndex} className="shop-service-item">
                    <span aria-hidden="true">
                      {String(itemIndex + 1).padStart(2, "0")}
                    </span>
                    {localizedValue(item, locale)}
                  </p>
                ))}
              </div>
            </section>
          );
        return (
          <section key={index} className="shell shop-home-section">
            <p className="mx-auto max-w-3xl whitespace-pre-wrap text-lg leading-9 text-muted md:text-xl">
              {localizedValue(block.text, locale)}
            </p>
          </section>
        );
      })}
    </main>
  );
}
