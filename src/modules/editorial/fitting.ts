import { cache } from "react";
import { storeCutoutModels } from "@/modules/catalog/cutouts/models";
import { validCompositionSlots } from "@/modules/catalog/cutouts/contracts";
import { fittingConfig } from "@/modules/fitting";
import {
  instantCatalog,
  resolveInstantSelection,
} from "@/modules/fitting/instant";
import { INSTANT_COMPOSITION_CAPACITY } from "@/modules/fitting/instant-contract";
import { FittingError } from "@/modules/fitting/contracts";
import type { Market } from "@/lib/request-context";
import { seoPath } from "@/lib/seo-urls";
import {
  editorialId,
  slugPattern,
  type EditorialLocale,
  type LookContent,
} from "./contracts";
import { resolveLookCommerce } from "./commerce";
import { editorialSlug, publishedBySlug, publishedEntry } from "./queries";

const modelKind = {
  WOMEN: "WOMAN",
  MEN: "MAN",
  GIRLS: "GIRL",
  BOYS: "BOY",
} as const;
const fittingAvailability = cache(async () => {
  const [config, models] = await Promise.all([
    fittingConfig(),
    storeCutoutModels(),
  ]);
  return config.instantEnabled ? models.map((model) => model.kind) : [];
});
export async function supportsLookFitting(body: LookContent) {
  return (await fittingAvailability()).includes(modelKind[body.audience]);
}

export async function resolveLookPreset(
  id: unknown,
  story: unknown,
  requested: unknown,
  market: Market,
  locale: EditorialLocale,
) {
  const input = editorialId.safeParse(id);
  if (!input.success) return null;
  const look = await publishedEntry("LOOK", { id: input.data }, market.id);
  if (look?.body.kind !== "LOOK") return null;
  const body = look.body;
  const [models, [commerce], article] = await Promise.all([
    storeCutoutModels(),
    resolveLookCommerce([body], market, locale),
    typeof story === "string" && story.length <= 96 && slugPattern.test(story)
      ? publishedBySlug("ARTICLE", locale, story, market.id)
      : null,
  ]);
  const lookHref = seoPath(
    locale,
    market.code,
    "looks",
    editorialSlug(look, locale),
  );
  const storyHref =
    article?.body.kind === "ARTICLE" &&
    article.body.blocks.some(
      (block) => block.type === "LOOK" && block.id === look.id,
    )
      ? seoPath(locale, market.code, "magazine", editorialSlug(article, locale))
      : undefined;
  const model = models.find((model) => model.kind === modelKind[body.audience]);
  const refs =
    typeof requested === "string" && requested.length <= 1300
      ? requested.split(",")
      : [];
  const candidateIds = commerce.pieces.flatMap((piece) => {
    const selected =
      piece.variants.find((v) => refs.includes(v.id)) ??
      piece.variants.find((v) => v.id === piece.variantId);
    return selected ? [selected.id] : [];
  });
  const catalog =
    model && candidateIds.length
      ? await instantCatalog(market.id, locale, "", {
          variantIds: candidateIds,
        })
      : [];
  let layers: NonNullable<(typeof catalog)[number]["placements"]> = [];
  for (const variantId of candidateIds) {
    if (layers.length === INSTANT_COMPOSITION_CAPACITY) break;
    const layer = catalog
      .find((entry) => entry.variantId === variantId)
      ?.placements.find((candidate) => candidate.model.id === model?.id);
    if (layer && validCompositionSlots([...layers, layer]))
      layers = [...layers, layer];
  }
  const variantIds = layers.map((layer) => layer.variantId);
  const view =
    model && variantIds.length
      ? await resolveInstantSelection(market.id, {
          modelId: model.id,
          variantIds,
        }).catch((error: unknown) => {
          if (error instanceof FittingError) return null;
          throw error;
        })
      : null;
  return {
    lookId: look.id,
    revisionId: look.revision.id,
    title: body.title[locale],
    lookHref,
    storyHref,
    missing: !view || variantIds.length < body.items.length,
    products: catalog,
    ...(model
      ? {
          selection: {
            modelId: model.id,
            variantIds: view ? variantIds : [],
            view,
          },
        }
      : {}),
  };
}
