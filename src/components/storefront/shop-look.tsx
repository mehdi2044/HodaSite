import { getTranslations } from "next-intl/server";
import { addLookAction } from "@/app/[locale]/commerce-actions";
import { preparedLooks, type ShopLookBlock } from "@/modules/outfits";
import { getDisplayPrice } from "@/modules/pricing";
import { localizedValue } from "@/modules/content/homepage";
import { ShopLookStudio, type StudioLabels } from "./shop-look-studio";

export async function ShopLook({
  block,
  locale,
  market,
}: {
  block: ShopLookBlock;
  locale: "fa" | "tr" | "en";
  market: Parameters<typeof getDisplayPrice>[2];
}) {
  const [looks, t] = await Promise.all([
    preparedLooks(block, market, locale),
    getTranslations("outfit"),
  ]);
  if (!looks.length) return null;
  const keys: (keyof StudioLabels)[] = [
    "eyebrow",
    "chooseLook",
    "pieces",
    "size",
    "chooseSize",
    "unavailable",
    "details",
    "subtotal",
    "addLook",
    "chooseSizes",
    "emptySelection",
    "completeImage",
    "demo",
    "inBag",
  ];
  return (
    <ShopLookStudio
      title={localizedValue(block.title, locale)}
      body={localizedValue(block.body, locale)}
      looks={looks}
      locale={locale}
      currency={
        (["USD", "TRY", "CAD", "IRT"].includes(market.currency)
          ? market.currency
          : "USD") as "USD" | "TRY" | "CAD" | "IRT"
      }
      labels={
        Object.fromEntries(keys.map((key) => [key, t(key)])) as StudioLabels
      }
      action={addLookAction.bind(null, locale)}
    />
  );
}
