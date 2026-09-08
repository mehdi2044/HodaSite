import React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { ResponsiveImage } from "@/components/storefront/responsive-image";
import {
  sanitizeBlocksForRender,
  type ContentBlock,
  type Localized,
} from "@/modules/content";

const localeText = (value: Localized, locale: string) =>
  value[locale as keyof Localized] || value.fa || value.en || "";

export async function ContentBlocks({
  blocks,
  locale,
}: {
  blocks: ContentBlock[];
  locale: "fa" | "tr" | "en";
}) {
  const safeBlocks = sanitizeBlocksForRender(blocks);
  const mediaIds = safeBlocks.flatMap((block) =>
    (block.type === "Image" || block.type === "Hero") && block.mediaId
      ? [block.mediaId]
      : [],
  );
  const media = mediaIds.length
    ? await db.media.findMany({
        where: { id: { in: mediaIds }, kind: "image", deletedAt: null },
      })
    : [];
  const mediaById = new Map(media.map((item) => [item.id, item]));

  return (
    <div className="grid gap-10">
      {safeBlocks.map((block, index) => {
        if (block.type === "RichText")
          return (
            <section
              key={index}
              className="prose max-w-none leading-8"
              dangerouslySetInnerHTML={{
                __html: localeText(block.html, locale),
              }}
            />
          );
        if (block.type === "Image") {
          const item = mediaById.get(block.mediaId);
          return item ? (
            <figure key={index} className="grid gap-2">
              <ResponsiveImage
                media={item}
                locale={locale}
                sizes="(max-width: 700px) 100vw, 1100px"
              />
              {localeText(block.caption, locale) && (
                <figcaption className="text-sm text-muted">
                  {localeText(block.caption, locale)}
                </figcaption>
              )}
            </figure>
          ) : null;
        }
        if (block.type === "Hero") {
          const item = block.mediaId ? mediaById.get(block.mediaId) : undefined;
          return (
            <section
              key={index}
              className="relative grid min-h-72 overflow-hidden rounded-token bg-black/5 p-8 md:p-14"
            >
              {item && (
                <div className="absolute inset-0 opacity-35">
                  <ResponsiveImage
                    media={item}
                    locale={locale}
                    sizes="100vw"
                    priority={index === 0}
                    imgClassName="h-full w-full object-cover"
                    className="h-full"
                  />
                </div>
              )}
              <div className="relative z-10 max-w-xl self-end">
                <h2 className="text-4xl font-semibold">
                  {localeText(block.title, locale)}
                </h2>
                <p className="mt-3 text-lg">{localeText(block.body, locale)}</p>
                {block.ctaUrl && localeText(block.ctaLabel, locale) && (
                  <Link
                    className="button mt-5 inline-flex items-center"
                    href={block.ctaUrl}
                  >
                    {localeText(block.ctaLabel, locale)}
                  </Link>
                )}
              </div>
            </section>
          );
        }
        if (block.type === "TwoColumns")
          return (
            <section key={index} className="grid gap-8 md:grid-cols-2">
              {[block.left, block.right].map((column, columnIndex) => (
                <div
                  key={columnIndex}
                  className="leading-8"
                  dangerouslySetInnerHTML={{
                    __html: localeText(column, locale),
                  }}
                />
              ))}
            </section>
          );
        if (block.type === "FAQ")
          return (
            <section key={index} className="grid gap-3">
              {block.items.map((item, itemIndex) => (
                <details key={itemIndex} className="card">
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    {localeText(item.question, locale)}
                  </summary>
                  <div
                    className="mt-3 leading-7"
                    dangerouslySetInnerHTML={{
                      __html: localeText(item.answer, locale),
                    }}
                  />
                </details>
              ))}
            </section>
          );
        if (block.type === "CTA")
          return (
            <section
              key={index}
              className="card flex flex-wrap items-center justify-between gap-4 bg-black text-white"
            >
              <h2 className="text-2xl">{localeText(block.title, locale)}</h2>
              <Link href={block.url} className="button">
                {localeText(block.label, locale)}
              </Link>
            </section>
          );
        if (block.type === "Countdown")
          return (
            <section key={index} className="card text-center">
              <h2>{localeText(block.title, locale)}</h2>
              <time
                dateTime={block.endsAt}
                className="mt-2 block text-xl"
                dir="ltr"
              >
                {new Date(block.endsAt).toLocaleString(locale)}
              </time>
            </section>
          );
        return (
          <section key={index} className="overflow-hidden rounded-token">
            {localeText(block.title, locale) && (
              <h2 className="mb-3">{localeText(block.title, locale)}</h2>
            )}
            <iframe
              src={block.url}
              title={localeText(block.title, locale)}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="fullscreen; picture-in-picture"
              className="aspect-video min-h-64 w-full border-0"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </section>
        );
      })}
    </div>
  );
}
