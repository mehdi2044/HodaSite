import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { storefrontPath } from "@/lib/storefront-path";
import { supportsLookFitting } from "@/modules/editorial/fitting";
import { seoPath } from "@/lib/seo-urls";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { editorialSlug } from "@/modules/editorial/queries";
import type { Market } from "@/lib/request-context";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import type { LookCommerce } from "@/modules/editorial/commerce";
import type { PublicLook } from "@/modules/editorial/gallery";
import type { ResponsiveImageMedia } from "./responsive-image";
import { EditorialImage } from "./editorial-image";

export async function CuratedCard({
  look,
  locale,
  market,
  commerce,
  images,
  weekly = false,
  allowFitting = true,
}: {
  look: PublicLook;
  locale: EditorialLocale;
  market: Market;
  commerce: LookCommerce;
  images: (ResponsiveImageMedia & { id: string })[];
  weekly?: boolean;
  allowFitting?: boolean;
}) {
  const [t, fitting] = await Promise.all([
    getTranslations({ locale, namespace: "editorial" }),
    allowFitting && supportsLookFitting(look.body),
  ]);
  const href = seoPath(
    locale,
    market.code,
    "looks",
    editorialSlug(look, locale),
  );
  const { body } = look;
  return (
    <article className="editorial-card">
      <Link href={href} aria-label={body.title[locale]}>
        <EditorialImage
          desktop={images.find((i) => i.id === body.mediaId)}
          mobile={images.find((i) => i.id === body.mobileMediaId)}
          focal={body.focal}
          locale={locale}
        />
      </Link>
      <div className="editorial-card-copy">
        <p className="editorial-kicker">
          {weekly
            ? t("weekly")
            : body.featured
              ? t("featured")
              : t(`facet.${body.audience}`)}
        </p>
        <h2>
          <Link href={href}>{body.title[locale]}</Link>
        </h2>
        <p>{body.summary[locale]}</p>
        <p>
          {t(`facet.${body.audience}`)} · {t(`facet.${body.occasion}`)} ·{" "}
          {t("pieceCount", { count: body.items.length })}
        </p>
        <p>
          {commerce.amount === null
            ? t("unavailable")
            : t("fromPrice", {
                amount: formatStorefrontAmount(
                  commerce.amount,
                  market.currency,
                  locale,
                ),
              })}{" "}
          · {t("stockCount", { count: commerce.available })}
        </p>
        <Link className="button" href={href}>
          {t("viewLook")}
        </Link>
        {fitting && (
          <Link
            href={storefrontPath(locale, market.code, "fitting-room", {
              look: look.id,
            })}
            prefetch={false}
          >
            {t("tryLook")}
          </Link>
        )}
      </div>
    </article>
  );
}
