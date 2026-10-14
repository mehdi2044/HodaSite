import { FittingAdMotion } from "./fitting-ad-motion";
import { ModaKidsRing } from "./moda-kids-ring";
import { publicCatalogCutout } from "@/modules/catalog/cutouts/resolve";
import { catalogText } from "@/modules/catalog";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { localizedValue } from "@/modules/content/homepage";
import type { Moda4Block } from "@/modules/content/moda4-contracts";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { moda4Products } from "@/modules/content/moda4-products";
import { resolvePublicCampaign } from "@/modules/content/campaigns";
import {
  getDisplayPrices,
  type getVariantDisplayPrices,
} from "@/modules/pricing";
import { resolveShoppableScene } from "@/modules/content/scenes/resolve";
import { ResponsiveImage } from "./responsive-image";
import { ShoppableScene } from "./shoppable-scene";
import { ProductCard } from "./product-card";
import { ModaCarousel } from "./moda-carousel";
import { ModaBands } from "./moda-bands";
import { ModaCampaign } from "./moda-campaign";
import { ModaVideo } from "./moda-video";
import { SceneArt } from "./scene-art";
import { ScenePriceSummary } from "./scene-price-summary";
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
    const items = await Promise.all(
      block.slides.map(async (slide, index) => {
        const [view, href, secondary] = await Promise.all([
          resolveShoppableScene(slide.scene, market, locale, {
            adminPreview: preview,
          }),
          resolveContentTarget(slide.target, market.id, locale),
          slide.secondaryTarget
            ? resolveContentTarget(slide.secondaryTarget, market.id, locale)
            : null,
        ]);
        return (
          <div className="moda-hero-slide" data-text-side={slide.textSide}>
            <p className="moda-eyebrow">{text(slide.eyebrow)}</p>
            <ShoppableScene
              poll={false}
              view={view}
              locale={locale}
              first={first && index === 0}
              headingLevel={first ? 1 : 2}
              preview={preview}
              body={text(slide.body)}
              cta={href ? { href, label: text(slide.ctaLabel) } : undefined}
            />
            {secondary && slide.secondaryLabel && (
              <Link className="button button-outline" href={secondary}>
                {text(slide.secondaryLabel)}
              </Link>
            )}
          </div>
        );
      }),
    );
    return (
      <ModaCarousel
        items={items}
        labels={block.slides.map((slide) => text(slide.scene.title))}
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
        const view = face.scene
          ? await resolveShoppableScene(face.scene, market, locale, {
              adminPreview: preview,
            })
          : null;
        return (
          <article className="moda-world-face">
            {view ? (
              <ShoppableScene
                poll={false}
                view={view}
                locale={locale}
                preview={preview}
              />
            ) : (
              await photo(face.desktop, face.mobile, text(face.title))
            )}
            <h3>{text(face.title)}</h3>
            <p>{text(face.subtitle)}</p>
            {href && (
              <Link className="button" href={href}>
                {text(face.title)}
              </Link>
            )}
          </article>
        );
      }),
    );
    const art = await Promise.all(
      block.faces.map((face) =>
        photo(
          face.scene?.desktop ?? face.desktop,
          face.scene?.mobile ?? face.mobile,
          text(face.title),
        ),
      ),
    );
    return (
      <ModaCarousel
        art={art}
        kind="prism"
        title={text(block.title)}
        items={items}
        labels={block.faces.map((face) => text(face.title))}
        seconds={block.autoplaySeconds}
      />
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
            block.looks.map(async (look, index) => {
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
                  final={
                    <ShoppableScene
                      poll={false}
                      view={views[index]}
                      locale={locale}
                      preview={preview}
                    />
                  }
                />
              );
            }),
          )
        : views.map((view) => (
            <ShoppableScene
              poll={false}
              key={view.id}
              view={view}
              locale={locale}
              preview={preview}
            />
          ));
    return (
      <div
        className={
          block.type === "FittingAd" ? "moda-fitting-ad" : "moda-lookbook"
        }
      >
        {block.type === "FittingAd" && <p>{text(block.body)}</p>}
        <ModaCarousel
          art={
            block.type === "Lookbook"
              ? views.map((view) => (
                  <SceneArt key={view.id} view={view} locale={locale} />
                ))
              : undefined
          }
          kind={block.type === "Lookbook" ? "lookbook" : "fitting"}
          title={text(block.title)}
          items={items}
          labels={views.map((view) => view.title)}
          seconds={block.type === "Lookbook" ? block.autoplaySeconds : 8}
        />
        {block.type === "Lookbook" && (
          <ScenePriceSummary views={views} locale={locale} />
        )}
        {block.type === "FittingAd" && <p>{t("fittingStaticExplanation")}</p>}
      </div>
    );
  }
  if (block.type === "NewIn" || block.type === "KidsWorld") {
    const products = await moda4Products(market.id, locale, block.source),
      prices = await getDisplayPrices(products, market);
    const href = await resolveContentTarget(block.target, market.id, locale);
    const kidsItems =
      block.type === "KidsWorld"
        ? await Promise.all(
            products.map(async (product) => {
              const cutout = product.variants[0]
                ? await publicCatalogCutout(product.variants[0].id, market.id)
                : null;
              const image = cutout?.media ?? product.media[0]?.media;
              return (
                <figure>
                  {image && (
                    <ResponsiveImage
                      media={{
                        ...image,
                        presentation: {
                          fit: "contain",
                          focalX: 0.5,
                          focalY: 0.5,
                        },
                      }}
                      locale={locale}
                      sizes="200px"
                      imgClassName="h-full w-full"
                    />
                  )}
                  <figcaption>
                    {catalogText(product.titleI18n, locale)}
                    {!cutout && (
                      <span className="block">{t("cutoutFallback")}</span>
                    )}
                  </figcaption>
                </figure>
              );
            }),
          )
        : [];
    return (
      <section
        className={`moda-product-rail ${block.type === "KidsWorld" ? "moda-kids-world" : ""}`}
        style={
          block.type === "KidsWorld"
            ? {
                background: `var(--${block.tone})`,
              }
            : undefined
        }
      >
        <div className="moda-section-head">
          <h2>{text(block.title)}</h2>
          {href && (
            <Link className="button button-outline" href={href}>
              {text(block.ctaLabel)}
            </Link>
          )}
        </div>
        {block.type === "KidsWorld" && <p>{text(block.body)}</p>}
        {block.type === "KidsWorld" && kidsItems.length > 0 && (
          <ModaKidsRing
            items={kidsItems}
            labels={products.map((product) =>
              catalogText(product.titleI18n, locale),
            )}
          />
        )}
        <div className="moda-snap-products">
          {await Promise.all(
            products.map((product) =>
              ProductCard({
                product: { ...product, displayPrice: prices.get(product.id)! },
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
      <section className="moda-services">
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
        <ShoppableScene
          poll={false}
          view={view}
          locale={locale}
          preview={preview}
          body={text(block.body)}
          cta={href ? { href, label: text(block.ctaLabel) } : undefined}
        />
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
      fallback={content}
      autoplay={block.mutedAutoplay}
    />
  ) : (
    content
  );
}
