import { FittingAdMotion } from "./fitting-ad-motion";
import { ModaHeroSlide } from "./moda-hero-slide";
import { ShoppableScene } from "./shoppable-scene";
import { isDemoFashionMedia } from "./responsive-image";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import {
  displayTitleText,
  heroFocalX,
  normalizeHeroLayout,
} from "@/modules/content/hero-layout";
import { resolveHeroFloat } from "@/modules/content/moda4-hero";
import { ModaKidsWorld } from "./moda-kids-world";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { localizedValue } from "@/modules/content/homepage";
import type { Moda4Block } from "@/modules/content/moda4-contracts";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { moda4Products } from "@/modules/content/moda4-products";
import { resolvePublicCampaign } from "@/modules/content/campaigns";
import { getDisplayPrices, getVariantDisplayPrices } from "@/modules/pricing";
import { resolveShoppableScene } from "@/modules/content/scenes/resolve";
import { ResponsiveImage } from "./responsive-image";
import { ProductCard } from "./product-card";
import { ModaCarousel } from "./moda-carousel";
import { ModaBands } from "./moda-bands";
import { ModaCampaign } from "./moda-campaign";
import { ModaVideo } from "./moda-video";
import { SceneArt } from "./scene-art";
import { ServicePolicySummary } from "./service-policy";
type Market = Parameters<typeof getVariantDisplayPrices>[1];
type Locale = "fa" | "tr" | "en";
export async function ModaHomepageBlock({
  block,
  market,
  locale,
  first = false,
  preview = false,
}: {
  block: Moda4Block;
  market: Market;
  locale: Locale;
  first?: boolean;
  preview?: boolean;
}) {
  const text = (value: Parameters<typeof localizedValue>[0]) =>
    localizedValue(value, locale);
  const t = await getTranslations("modaHomepage");
  async function photo(
    desktop: {
      mediaId: string;
      fit: "cover" | "contain";
      focal: { x: number; y: number };
      aspect: string;
    },
    mobile: typeof desktop,
    alt: string,
  ) {
    const images = await db.media.findMany({
      where: {
        id: { in: [desktop.mediaId, mobile.mediaId] },
        kind: "image",
        status: "READY",
        deletedAt: null,
      },
    });
    return (
      <div className="moda-content-photo">
        {(["desktop", "mobile"] as const).map((kind) => {
          const frame = kind === "desktop" ? desktop : mobile,
            image = images.find((item) => item.id === frame.mediaId);
          return (
            <div
              key={kind}
              className={`scene-photo scene-photo-${kind}`}
              style={{ aspectRatio: frame.aspect.replace(":", "/") }}
            >
              {image ? (
                <ResponsiveImage
                  media={{
                    ...image,
                    altI18n: { [locale]: alt },
                    presentation: {
                      fit: frame.fit,
                      focalX: frame.focal.x,
                      focalY: frame.focal.y,
                    },
                  }}
                  locale={locale}
                  sizes="100vw"
                  priority={first}
                  imgClassName="h-full w-full"
                />
              ) : (
                <p>{t("mediaUnavailable")}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (block.type === "Bands")
    return (
      <ModaBands
        first={block.first.map(text)}
        second={block.second.map(text)}
        seconds={block.durationSeconds}
      />
    );
  if (block.type === "HeroSlider") {
    // M4-01: physical composition + every worn garment priced (owner rule 2026-10-14).
    const scenes = await getTranslations("scenes");
    const priceOf = (
      piece: Awaited<
        ReturnType<typeof resolveShoppableScene>
      >["pieces"][number],
      currency: string,
    ) => {
      if (!piece.range)
        return scenes(
          piece.variants.some((v) => v.available > 0)
            ? "priceUnavailable"
            : "outOfStock",
        );
      const min = formatStorefrontAmount(piece.range.min, currency, locale);
      return piece.range.min === piece.range.max
        ? min
        : scenes("from", { price: min });
    };
    const items = await Promise.all(
      block.slides.map(async (slide, index) => {
        const layout = normalizeHeroLayout(slide);
        const [view, href, secondary, float] = await Promise.all([
          resolveShoppableScene(slide.scene, market, locale, {
            adminPreview: preview,
          }),
          resolveContentTarget(slide.target, market.id, locale),
          slide.secondaryTarget
            ? resolveContentTarget(slide.secondaryTarget, market.id, locale)
            : null,
          slide.float
            ? resolveHeroFloat(slide.float, market, locale)
            : Promise.resolve(null),
        ]);
        const [subtitle, ...rest] = text(slide.body).split("\n");
        return (
          <ModaHeroSlide
            key={slide.id}
            locale={locale}
            index={index}
            first={first && index === 0}
            layout={layout}
            desktop={{
              media: view.desktop.media,
              focal: { x: heroFocalX(layout), y: view.desktop.frame.focal.y },
            }}
            mobile={{
              media: view.mobile.media,
              focal: view.mobile.frame.focal,
            }}
            eyebrow={text(slide.eyebrow)}
            title={view.title}
            subtitle={rest.length ? subtitle : undefined}
            body={rest.length ? rest.join("\n") : subtitle}
            cta={href ? { href, label: text(slide.ctaLabel) } : undefined}
            secondary={
              secondary && slide.secondaryLabel
                ? { href: secondary, label: text(slide.secondaryLabel) }
                : undefined
            }
            accent={slide.target.kind === "fitting"}
            // A scene that is not publicly valid shows no pins and no prices (never stale/fabricated).
            pins={
              view.reason
                ? []
                : view.pieces.map((piece) => ({
                    id: piece.id,
                    title: piece.title,
                    price: priceOf(piece, view.currency),
                    href: piece.href,
                    desktop: piece.desktop,
                    mobile: piece.mobile,
                  }))
            }
            float={float}
            demoNote={
              isDemoFashionMedia(view.desktop.media ?? undefined) ||
              isDemoFashionMedia(view.mobile.media ?? undefined)
                ? t("demoImage")
                : undefined
            }
            labels={{ prices: t("heroPrices") }}
            sceneId={view.id}
            view={view}
            preview={preview}
            purchase={
              view.pieces.length > 0 ? (
                <ShoppableScene
                  only="purchase"
                  view={view}
                  locale={locale}
                  poll={false}
                  preview={preview}
                />
              ) : undefined
            }
          />
        );
      }),
    );
    return (
      <ModaCarousel
        items={items}
        labels={block.slides.map((slide) =>
          displayTitleText(text(slide.scene.title)),
        )}
        seconds={block.autoplaySeconds}
      />
    );
  }
  if (block.type === "WorldsPrism") {
    const items = await Promise.all(
      block.faces.map(async (face) => {
        const href = await resolveContentTarget(
          { kind: "category", id: face.categoryId },
          market.id,
          locale,
        );
        return (
          <article className="moda-world-face">
            {href && (
              <Link className="button" href={href}>
                {t("worldEnter", { title: text(face.title) })}
              </Link>
            )}
          </article>
        );
      }),
    );
    const art = await Promise.all(
      block.faces.map(async (face, index) => {
        const href = await resolveContentTarget(
          { kind: "category", id: face.categoryId },
          market.id,
          locale,
        );
        return (
          <Link className="moda-world-art" href={href ?? `/${locale}/search`}>
            {await photo(face.desktop, face.mobile, text(face.title))}
            <span className="moda-world-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="moda-world-caption">
              <span>{text(face.title)}</span>
              <b
                data-moda4-display={
                  /\p{Script=Latin}/u.test(text(face.subtitle)) &&
                  !/\p{Script=Arabic}/u.test(text(face.subtitle))
                    ? ""
                    : undefined
                }
                lang={
                  /\p{Script=Latin}/u.test(text(face.subtitle)) &&
                  !/\p{Script=Arabic}/u.test(text(face.subtitle))
                    ? "en"
                    : locale
                }
                dir={
                  /\p{Script=Latin}/u.test(text(face.subtitle)) &&
                  !/\p{Script=Arabic}/u.test(text(face.subtitle))
                    ? "ltr"
                    : undefined
                }
              >
                {text(face.subtitle)}
              </b>
            </div>
          </Link>
        );
      }),
    );
    return (
      <div className="moda-worlds-layout">
        <ModaCarousel
          intro={
            <div className="moda-worlds-copy">
              <h2>{text(block.title)}</h2>
              <p>{t("worldsIntro")}</p>
            </div>
          }
          art={art}
          kind="prism"
          title={text(block.title)}
          items={items}
          labels={block.faces.map((face) => text(face.title))}
          seconds={block.autoplaySeconds}
        />
      </div>
    );
  }
  if (block.type === "Lookbook" || block.type === "FittingAd") {
    const scenes =
      block.type === "Lookbook"
        ? block.scenes
        : block.looks.map((look) => look.finalPhoto ?? look.scene);
    const views = await Promise.all(
      scenes.map((scene) =>
        resolveShoppableScene(scene, market, locale, { adminPreview: preview }),
      ),
    );
    const items =
      block.type === "FittingAd"
        ? await Promise.all(
            block.looks.map(async (look) => {
              const staged = await resolveShoppableScene(
                look.scene,
                market,
                locale,
                { adminPreview: preview },
              );
              return (
                <FittingAdMotion
                  key={look.id}
                  view={staged}
                  locale={locale}
                  final={null}
                />
              );
            }),
          )
        : views.map((view) => (
            <Link
              key={view.id}
              href={view.pieces[0]?.href ?? `/${locale}/search`}
            >
              {view.title}
            </Link>
          ));
    return (
      <div
        data-moda4={block.type === "FittingAd" ? "fitting-ad" : "lookbook"}
        className={
          block.type === "FittingAd" ? "moda-fitting-ad" : "moda-lookbook"
        }
      >
        {block.type === "FittingAd" && (
          <div className="moda-fitting-copy">
            <h2 data-moda4-display="" lang="en" dir="ltr">
              {text(block.title)}
            </h2>
            <p>{text(block.body)}</p>
            <Link
              data-moda4-cta=""
              className="button"
              href={`/${locale}/fitting-room?market=${market.code}`}
            >
              {text(block.ctaLabel)}
            </Link>
          </div>
        )}
        <ModaCarousel
          art={
            block.type === "Lookbook"
              ? views.map((view) => (
                  <SceneArt key={view.id} view={view} locale={locale} />
                ))
              : undefined
          }
          kind={block.type === "Lookbook" ? "lookbook" : "fitting"}
          title={block.type === "Lookbook" ? text(block.title) : undefined}
          items={items}
          labels={views.map((view) => view.title)}
          seconds={block.type === "Lookbook" ? block.autoplaySeconds : 8}
        />
      </div>
    );
  }
  if (block.type === "KidsWorld")
    return <ModaKidsWorld block={block} market={market} locale={locale} />;
  if (block.type === "NewIn") {
    const products = await moda4Products(market.id, locale, block.source);
    const [prices, variantPrices] = await Promise.all([
      getDisplayPrices(products, market),
      getVariantDisplayPrices(products, market),
    ]);
    const href = await resolveContentTarget(block.target, market.id, locale);
    return (
      <section data-moda4="new-in" className="moda-product-rail">
        <div className="moda-section-head">
          <h2>{text(block.title)}</h2>
          {href && (
            <Link className="button button-outline" href={href}>
              {text(block.ctaLabel)}
            </Link>
          )}
        </div>
        <div className="moda-snap-products">
          {await Promise.all(
            products.map((product) =>
              ProductCard({
                product: {
                  ...product,
                  displayPrice: prices.get(product.id)!,
                },
                variantPrices,
                locale,
                market,
                readOnly: preview,
              }),
            ),
          )}
        </div>
        {products.length === 0 && <p>{t("noProducts")}</p>}
      </section>
    );
  }
  if (block.type === "Services")
    return (
      <section data-moda4="services" className="moda-services">
        <h2>{text(block.title)}</h2>
        <ServicePolicySummary
          marketId={market.id}
          locale={locale}
          keys={block.keys}
        />
      </section>
    );
  const href = await resolveContentTarget(block.target, market.id, locale);
  const view = block.scene
    ? await resolveShoppableScene(
        block.type === "VideoBanner"
          ? { ...block.scene, relatedVideoMediaId: block.videoMediaId }
          : block.scene,
        market,
        locale,
        {
          adminPreview: preview,
        },
      )
    : null;
  const content = (
    <div className="moda-banner-content">
      {view && <h2>{text(block.title)}</h2>}
      {view ? (
        <>
          <SceneArt view={view} locale={locale} />
          <p>{text(block.body)}</p>
          {href && (
            <Link data-moda4-cta="" className="button" href={href}>
              {text(block.ctaLabel)}
            </Link>
          )}
        </>
      ) : (
        <>
          {await photo(block.desktop, block.mobile, text(block.title))}
          <h2>{text(block.title)}</h2>
          <p>{text(block.body)}</p>
          {href && (
            <Link className="button" href={href}>
              {text(block.ctaLabel)}
            </Link>
          )}
        </>
      )}
    </div>
  );
  if (block.type === "Campaign") {
    const campaign = await resolvePublicCampaign(
      block.programId,
      market.id,
      market.currency,
      locale,
    );
    if (!campaign)
      return preview ? <p role="status">{t("campaignUnavailable")}</p> : null;
    return (
      <ModaCampaign
        campaign={campaign}
        content={content}
        popup={block.popup}
        popupKey={`moda-popup:v1:${market.id}:${block.id}:${campaign.id}`}
        countdown={block.countdown}
        preview={preview}
      />
    );
  }
  const video = await db.media.findFirst({
    where: {
      id: block.videoMediaId,
      kind: "video",
      status: "READY",
      deletedAt: null,
      mime: { in: ["video/mp4", "video/webm"] },
    },
    select: { url: true },
  });
  return video ? (
    <ModaVideo
      sceneId={block.scene?.id}
      url={view?.relatedVideo?.url ?? video.url}
      poster={
        view?.mobile.media?.url ??
        (
          await db.media.findFirst({
            where: {
              id: block.mobile.mediaId,
              kind: "image",
              status: "READY",
              deletedAt: null,
            },
            select: { url: true },
          })
        )?.url
      }
      fallback={content}
      autoplay={block.mutedAutoplay}
    />
  ) : (
    content
  );
}
