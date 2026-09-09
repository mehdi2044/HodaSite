import { getTranslations } from "next-intl/server";
import { getRequestContext } from "@/lib/request-context";
import { getHomepage } from "@/modules/content/homepage";
import { HomepageBlocks } from "@/components/storefront/homepage-blocks";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const safeLocale = locale as "fa" | "tr" | "en";
  const { market } = await getRequestContext(locale);
  const homepage = await getHomepage(market.id);

  if (!homepage.blocks.length)
    return (
      <main
        className="shell grid min-h-[24rem] place-items-center"
        dir={locale === "fa" ? "rtl" : "ltr"}
      >
        <p className="text-muted">{t("homepage.empty")}</p>
      </main>
    );
  return (
    <HomepageBlocks
      blocks={homepage.blocks}
      locale={safeLocale}
      market={market}
    />
  );
}
