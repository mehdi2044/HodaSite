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
      orderBy: { sortOrder: "asc" },
      take: 12,
      include: { media: true },
    }),
  ]);
  const mediaById = new Map(media.map((item) => [item.id, item]));
  return (
    <main dir={locale === "fa" ? "rtl" : "ltr"}>
      {blocks.map((block, index) => {
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
                      product={product}
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
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {localizedValue(block.title, locale)}
              </h2>
              {!categories.length && (
                <p className="shop-inline-empty">{t("emptyCategories")}</p>
              )}
              <div className="shop-category-grid">
                {categories.slice(0, block.source.limit).map((category) => (
                  <Link
                    key={category.id}
                    href={`/${locale}/c/${encodeURIComponent(localizedValue(category.slugI18n as Record<Locale, string>, locale))}`}
                    className="shop-category-card group overflow-hidden rounded-token bg-surface shadow-[0_16px_50px_rgba(57,35,11,0.08)]"
                  >
                    {category.media &&
                      category.media.status === "READY" &&
                      !category.media.deletedAt && (
                        <ResponsiveImage
                          media={category.media}
                          locale={locale}
                          sizes="(max-width:640px) 25vw,25vw"
                          className="shop-category-image"
                          imgClassName="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      )}
                    <h3 className="shop-category-name">
                      {localizedValue(
                        category.titleI18n as Record<Locale, string>,
                        locale,
                      )}
                    </h3>
                  </Link>
                ))}
              </div>
            </section>
          );
        if (block.type === "TrustBar")
          return (
            <section key={index} className="border-y border-black/5 bg-surface">
              <div className="shell grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">
                {block.items.map((item, itemIndex) => (
                  <p
                    key={itemIndex}
                    className="flex min-h-11 items-center justify-center rounded-full bg-bg px-4 text-center font-medium"
                  >
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
