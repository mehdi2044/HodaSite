import Link from "next/link";
import { db } from "@/lib/db";
import { ResponsiveImage } from "./responsive-image";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";
import { listCatalogProducts } from "@/modules/catalog";
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
          ? listCatalogProducts(market.id, locale, {
              limit: block.source.limit,
              ...(block.source.mode === "category" && block.source.referenceId
                ? { categoryId: block.source.referenceId }
                : {}),
              ...(block.source.mode === "collection" && block.source.referenceId
                ? { collectionId: block.source.referenceId }
                : {}),
            })
          : Promise.resolve(null),
      ),
    ),
    db.category.findMany({
      where: { deletedAt: null },
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
              className="relative isolate min-h-[32rem] overflow-hidden bg-text text-bg md:min-h-[42rem]"
            >
              {image && (
                <ResponsiveImage
                  media={image}
                  locale={locale}
                  sizes="100vw"
                  priority={index === 0}
                  className="absolute inset-0 -z-10 h-full w-full opacity-75"
                />
              )}
              <div className="shell flex min-h-[32rem] max-w-4xl flex-col justify-end py-16 md:min-h-[42rem] md:py-24">
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
                    href={block.ctaUrl}
                  >
                    {localizedValue(block.ctaLabel, locale)}
                  </Link>
                )}
              </div>
            </section>
          );
        }
        if (block.type === "ProductStrip")
          return (
            <section key={index} className="shell py-16 md:py-24">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {localizedValue(block.title, locale)}
              </h2>
              <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
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
            <section key={index} className="shell py-16 md:py-24">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {localizedValue(block.title, locale)}
              </h2>
              <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                {categories.slice(0, block.source.limit).map((category) => (
                  <Link
                    key={category.id}
                    href={`/${locale}/c/${encodeURIComponent(localizedValue(category.slugI18n as Record<Locale, string>, locale))}`}
                    className="group overflow-hidden rounded-token bg-surface shadow-[0_16px_50px_rgba(57,35,11,0.08)]"
                  >
                    {category.media && (
                      <ResponsiveImage
                        media={category.media}
                        locale={locale}
                        sizes="(max-width:640px) 50vw,25vw"
                        className="aspect-[4/5] overflow-hidden bg-black/5"
                        imgClassName="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    )}
                    <h3 className="p-4 text-lg font-semibold">
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
          <section key={index} className="shell py-16 md:py-24">
            <p className="mx-auto max-w-3xl whitespace-pre-wrap text-lg leading-9 text-muted md:text-xl">
              {localizedValue(block.text, locale)}
            </p>
          </section>
        );
      })}
    </main>
  );
}
