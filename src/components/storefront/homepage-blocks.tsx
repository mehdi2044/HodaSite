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
        if (block.type === "CategoryCards" || block.type === "ProductStrip")
          return (
            <section key={index} className="shell py-16 md:py-24">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {localizedValue(block.title, locale)}
              </h2>
              <div
                className="mt-8 grid min-h-52 place-items-center rounded-token border border-black/5 bg-surface px-6 text-center text-muted shadow-[0_20px_70px_rgba(57,35,11,0.06)]"
                role="status"
              >
                {phase2}
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
