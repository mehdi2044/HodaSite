import { getTranslations } from "next-intl/server";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import type { SceneView } from "@/modules/content/scenes/resolve";
/** Legible parallel list: decorative cylinders never hide a garment's price in hover. */
export async function ScenePriceSummary({
  views,
  locale,
}: {
  views: SceneView[];
  locale: "fa" | "tr" | "en";
}) {
  const t = await getTranslations("scenes");
  return (
    <div className="moda-ring-prices">
      {views.map((view) => (
        <article key={view.id}>
          <h3>{view.title}</h3>
          {view.reason ? (
            <p>{t(view.reason)}</p>
          ) : (
            view.pieces.map((piece) => (
              <p key={piece.id}>
                <a href={piece.href}>{piece.title}</a>
                <bdi>
                  {piece.range
                    ? piece.range.min === piece.range.max
                      ? formatStorefrontAmount(
                          piece.range.min,
                          view.currency,
                          locale,
                        )
                      : t("from", {
                          price: formatStorefrontAmount(
                            piece.range.min,
                            view.currency,
                            locale,
                          ),
                        })
                    : t("priceUnavailable")}
                </bdi>
              </p>
            ))
          )}
        </article>
      ))}
    </div>
  );
}
