import { addCuratedLookAction } from "@/app/[locale]/looks/actions";
import type { ComponentProps } from "react";
import type { Market } from "@/lib/request-context";
import { seoPath } from "@/lib/seo-urls";
import { storefrontPath } from "@/lib/storefront-path";
import type { LookCommerce } from "@/modules/editorial/commerce";
import type {
  EditorialLocale,
  LookContent,
} from "@/modules/editorial/contracts";
import type { LookVisual } from "@/modules/editorial/visual";
import { editorialSlug } from "@/modules/editorial/queries";
import { CuratedCard } from "./curated-card";
import {
  isDemoFashionMedia,
  type ResponsiveImageMedia,
} from "./responsive-image";
import { LivingRailDisplay } from "./living-rail-display";

export function GalleryEntrance(props: ComponentProps<typeof CuratedCard>) {
  const { look, locale, market, commerce, weekly, fitting, articleHref } =
    props;
  if (!look.body.livingRail || look.visual?.mode !== "PHOTO") {
    return <CuratedCard {...props} />;
  }
  return (
    <LivingRail
      id={look.id}
      revisionId={look.revision.id}
      slug={editorialSlug(look, locale)}
      body={look.body}
      visual={look.visual}
      commerce={commerce}
      locale={locale}
      market={market}
      weekly={weekly}
      fitting={fitting}
      articleHref={articleHref}
    />
  );
}

function picture({
  originalName,
  url,
  variants,
  width,
  height,
  blurDataUrl,
  altI18n,
}: ResponsiveImageMedia): ResponsiveImageMedia {
  return { originalName, url, variants, width, height, blurDataUrl, altI18n };
}

export function LivingRail({
  id,
  revisionId,
  slug,
  body,
  visual,
  commerce,
  market,
  locale,
  weekly = false,
  fitting = false,
  articleHref,
  preview = false,
}: {
  id: string;
  revisionId: string;
  slug: string;
  body: LookContent;
  visual: LookVisual;
  commerce: LookCommerce;
  market: Market;
  locale: EditorialLocale;
  weekly?: boolean;
  fitting?: boolean;
  articleHref?: string;
  preview?: boolean;
}) {
  if (!body.livingRail || visual.mode !== "PHOTO" || !visual.desktop)
    return null;
  const pieces = commerce.pieces.flatMap((piece) => {
    const reference = piece.variants.find(({ id }) => id === piece.variantId);
    if (!reference || !piece.title || !piece.href) return [];
    const image = visual.pieces.find(
      ({ variantId }) => variantId === reference.id,
    )?.image;
    return [
      {
        productId: piece.productId,
        title: piece.title,
        href:
          piece.href + "?" + new URLSearchParams({ color: reference.colorId }),
        role: piece.railRole,
        reference,
        image: image && picture(image),
        variants: piece.variants.filter(
          ({ colorId }) => colorId === reference.colorId,
        ),
      },
    ];
  });
  return (
    <LivingRailDisplay
      key={revisionId}
      artwork={picture(visual.desktop)}
      portrait={visual.mobile && picture(visual.mobile)}
      settings={body.livingRail}
      title={body.title[locale]}
      pieces={pieces}
      weekly={weekly}
      locale={locale}
      currency={market.currency}
      demo={
        isDemoFashionMedia(visual.desktop) ||
        pieces.some(({ image }) => isDemoFashionMedia(image))
      }
      lookHref={
        preview ? undefined : seoPath(locale, market.code, "looks", slug)
      }
      fittingHref={
        preview || !fitting
          ? undefined
          : storefrontPath(locale, market.code, "fitting-room", { look: id })
      }
      articleHref={preview ? undefined : articleHref}
      action={
        preview
          ? undefined
          : addCuratedLookAction.bind(null, locale, id, revisionId)
      }
    />
  );
}
