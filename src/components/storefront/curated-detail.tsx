import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { storefrontPath } from "@/lib/storefront-path";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import type { Market } from "@/lib/request-context";
import { addCuratedLookAction } from "@/app/[locale]/looks/actions";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { readyImages } from "@/modules/editorial/queries";
import type {
  EditorialLocale,
  LookContent,
} from "@/modules/editorial/contracts";
import { CuratedPurchase } from "./curated-purchase";
import { EditorialImage } from "./editorial-image";

export async function CuratedDetail({
  body,
  locale,
  market,
  id,
  revisionId,
  preview,
  story,
}: {
  body: LookContent;
  locale: EditorialLocale;
  market: Market;
  id: string;
  revisionId: string;
  preview?: boolean;
  story?: string;
}) {
  const [t, [commerce], images, fitting] = await Promise.all([
    getTranslations({ locale, namespace: "editorial" }),
    resolveLookCommerce([body], market, locale),
    readyImages([body.mediaId, body.mobileMediaId ?? body.mediaId]),
    preview ? false : supportsLookFitting(body),
  ]);
  return (
    <>
      <header className="editorial-heading">
        {!preview && (
          <Link href={seoPath(locale, market.code, "looks")}>
            {t("gallery")}
          </Link>
        )}
        <p>
          {t(`facet.${body.audience}`)} · {t(`facet.${body.style}`)} ·{" "}
          {t(`facet.${body.occasion}`)}
        </p>
        <h1>{body.title[locale]}</h1>
        <p>{body.summary[locale]}</p>
      </header>
      <div className="editorial-look-layout">
        <figure className="editorial-look-figure">
          <EditorialImage
            desktop={images.find((i) => i.id === body.mediaId)}
            mobile={images.find((i) => i.id === body.mobileMediaId)}
            focal={body.focal}
            locale={locale}
            priority
          />
          {images.length > 0 &&
            commerce.pieces.map(
              (piece, index) =>
                (piece.desktop || piece.mobile) &&
                (["desktop", "mobile"] as const).map((device) => {
                  const point = piece[device] ?? piece.desktop ?? piece.mobile!;
                  return (
                    <a
                      key={`${piece.productId}-${device}`}
                      className={`editorial-pin editorial-${device}-image`}
                      href={`#look-piece-${index + 1}`}
                      aria-label={piece.title ?? t("unavailable")}
                      style={{
                        left: `${point.x * 100}%`,
                        top: `${point.y * 100}%`,
                      }}
                    >
                      {index + 1}
                    </a>
                  );
                }),
            )}
        </figure>
        <CuratedPurchase
          key={`${revisionId}:${market.id}`}
          pieces={commerce.pieces}
          locale={locale}
          currency={market.currency}
          fittingHref={
            fitting
              ? storefrontPath(locale, market.code, "fitting-room", {
                  look: id,
                  ...(story ? { story } : {}),
                })
              : undefined
          }
          action={
            preview
              ? undefined
              : addCuratedLookAction.bind(null, locale, id, revisionId)
          }
        />
      </div>
    </>
  );
}
