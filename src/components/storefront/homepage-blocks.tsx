import Link from "next/link";
import { db } from "@/lib/db";
import { ResponsiveImage } from "./responsive-image";
import { localizedValue, type HomepageBlock } from "@/modules/content/homepage";

type Locale = "fa" | "tr" | "en";

export async function HomepageBlocks({
  blocks,
  locale,
  phase2,
}: {
  blocks: HomepageBlock[];
  locale: Locale;
  phase2: string;
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
  const media = mediaIds.length
    ? await db.media.findMany({
        where: {
          id: { in: mediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      })
    : [];
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
              className="relative isolate min-h-[24rem] overflow-hidden bg-black text-white"
            >
              {image && (
                <ResponsiveImage
                  media={image}
                  locale={locale}
                  sizes="100vw"
                  priority={index === 0}
                  className="absolute inset-0 -z-10 h-full w-full opacity-70"
                />
              )}
              <div className="shell flex min-h-[24rem] max-w-4xl flex-col justify-end py-16">
                <h1 className="text-4xl font-semibold md:text-7xl">
                  {localizedValue(block.title, locale)}
                </h1>
                <p className="mt-3 max-w-2xl text-lg">
                  {localizedValue(block.body, locale)}
                </p>
                {block.ctaUrl && localizedValue(block.ctaLabel, locale) && (
                  <Link className="button mt-6 w-fit" href={block.ctaUrl}>
                    {localizedValue(block.ctaLabel, locale)}
                  </Link>
                )}
              </div>
            </section>
          );
        }
        if (block.type === "CategoryCards" || block.type === "ProductStrip")
          return (
            <section key={index} className="shell py-12">
              <h2 className="text-2xl font-semibold">
                {localizedValue(block.title, locale)}
              </h2>
              <div
                className="mt-5 grid min-h-36 place-items-center rounded-token border border-dashed border-black/20 bg-surface text-muted"
                role="status"
              >
                {phase2}
              </div>
            </section>
          );
        if (block.type === "TrustBar")
          return (
            <section key={index} className="bg-surface">
              <div className="shell grid gap-4 py-7 sm:grid-cols-2 lg:grid-cols-4">
                {block.items.map((item, itemIndex) => (
                  <p key={itemIndex} className="min-h-11 font-medium">
                    {localizedValue(item, locale)}
                  </p>
                ))}
              </div>
            </section>
          );
        return (
          <section key={index} className="shell py-12">
            <p className="mx-auto max-w-3xl whitespace-pre-wrap text-lg leading-8">
              {localizedValue(block.text, locale)}
            </p>
          </section>
        );
      })}
    </main>
  );
}
