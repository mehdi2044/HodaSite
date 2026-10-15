import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { instantSnapshotSchema } from "@/modules/fitting/instant-contract";
import { resolveInstantSelection } from "@/modules/fitting/instant";
import { ResponsiveImage } from "./responsive-image";
import { SceneLayerImage } from "./scene-layer";
export async function InstantLookTile({
  look,
  marketId,
  locale,
}: {
  look: { id: string; name: string; snapshot: unknown };
  marketId: string;
  locale: "fa" | "tr" | "en";
}) {
  const parsed = instantSnapshotSchema.safeParse(look.snapshot),
    t = await getTranslations("instantFitting");
  let view: Awaited<ReturnType<typeof resolveInstantSelection>> | null = null;
  if (parsed.success)
    try {
      view = await resolveInstantSelection(marketId, {
        modelId: parsed.data.modelId,
        variantIds: parsed.data.variantIds,
      });
    } catch {}
  const current =
    !!view && parsed.success && view.fingerprint === parsed.data.fingerprint;
  return (
    <Link
      href={`/${locale}/fitting-room#instant-${look.id}`}
      aria-label={look.name}
    >
      {current && view && (
        <div className="relative block aspect-[3/4] overflow-hidden">
          <ResponsiveImage
            media={{ ...view.model.media, presentation: { fit: "contain" } }}
            locale={locale}
            role="catalog"
            sizes="(max-width:767px) 50vw,25vw"
            className="block h-full w-full"
            imgClassName="h-full w-full object-contain"
          />
          {view.layers.map((layer) => (
            <SceneLayerImage
              key={layer.variantId}
              layer={layer}
              model={view.model.media}
              locale={locale}
              frame={{
                mediaId: view.snapshot.modelMediaId,
                fit: "contain",
                aspect: "3:4",
                focal: { x: 0.5, y: 0.5 },
              }}
            />
          ))}
        </div>
      )}
      <span>{look.name}</span>
      {!current && <small>{t("review")}</small>}
    </Link>
  );
}
