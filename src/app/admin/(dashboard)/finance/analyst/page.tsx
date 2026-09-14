import { getLocale, getTranslations } from "next-intl/server";
import { aiAccess, sessionActor } from "@/modules/ai/access";
import { AiFinancial } from "@/components/admin/ai-financial";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ marketId?: string }>;
}) {
  const { marketId } = await searchParams;
  await aiAccess(
    await sessionActor(),
    "ai.finance.analyze",
    marketId ? { marketId } : {},
  );
  const t = await getTranslations("aiAdmin"),
    locale = await getLocale();
  return (
    <div className="grid max-w-3xl gap-5">
      <h1 className="text-2xl font-semibold">{t("analyst")}</h1>
      <p className="text-muted">{t("analystHelp")}</p>
      <AiFinancial marketId={marketId} locale={locale} />
    </div>
  );
}
