import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { storefrontPath } from "@/lib/storefront-path";
import { seoPath } from "@/lib/seo-urls";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { editorialSlug } from "@/modules/editorial/queries";
import type { Market } from "@/lib/request-context";
import type { EditorialLocale } from "@/modules/editorial/contracts";
import type { LookCommerce } from "@/modules/editorial/commerce";
import type { PublicLook } from "@/modules/editorial/gallery";
import { LookArtwork } from "./look-visual";

export function CuratedCard({
  look,
  locale,
  market,
  commerce,
  weekly = false,
  hero = false,
  wide = false,
  articleHref,
  fitting = false,
  t,
}: {
  look: PublicLook;
  locale: EditorialLocale;
  market: Market;
  commerce: LookCommerce;
  weekly?: boolean;
  hero?: boolean;
  wide?: boolean;
  articleHref?: string;
  fitting?: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"editorial">>>;
}) {
  const href = seoPath(
    locale,
    market.code,
    "looks",
    editorialSlug(look, locale),
  );
  const { body } = look;
  if (!look.visual) return null;
  const Title = hero ? "h1" : "h2";
  return (
    <article
      className={`editorial-card look-card${hero ? " look-hero" : ""}${weekly ? " look-weekly" : ""}`}
    >
      <Link
        className="look-artwork"
        href={href}
        aria-label={body.title[locale]}
      >
        <LookArtwork
          body={body}
          visual={look.visual}
          locale={locale}
          label={t("composition")}
          priority={hero}
          frame={hero || wide ? "wide" : "portrait"}
        />
      </Link>
      <div className="editorial-card-copy">
        {(hero || weekly) && (
          <p className="editorial-kicker">{t(hero ? "gallery" : "weekly")}</p>
        )}
        <Title>
          <Link href={href}>{body.title[locale]}</Link>
        </Title>
        {(hero || (weekly && articleHref)) && (
          <p className="look-summary">{body.summary[locale]}</p>
        )}
        <div className="look-meta">
          <span>
            {t(`facet.${body.audience}`)} ·{" "}
            {t("pieceCount", { count: body.items.length })}
          </span>
          <strong>
            {commerce.amount === null || commerce.available < body.items.length
              ? t("unavailable")
              : t("fromPrice", {
                  amount: formatStorefrontAmount(
                    commerce.amount,
                    market.currency,
                    locale,
                  ),
                })}
          </strong>
        </div>
        {commerce.available < body.items.length && (
          <p>{t("stockCount", { count: commerce.available })}</p>
        )}
        <div className="look-actions">
          <Link
            className={hero ? "button look-primary" : "look-detail-link"}
            href={href}
          >
            {t("viewLook")}
          </Link>
          {fitting && (
            <Link
              className={weekly ? "button look-primary" : undefined}
              href={storefrontPath(locale, market.code, "fitting-room", {
                look: look.id,
              })}
              prefetch={false}
            >
              {t("tryLook")}
            </Link>
          )}
          {articleHref && <Link href={articleHref}>{t("relatedArticle")}</Link>}
        </div>
      </div>
    </article>
  );
}
