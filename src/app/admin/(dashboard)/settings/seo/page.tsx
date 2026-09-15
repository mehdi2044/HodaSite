import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { getSeoSettings } from "@/modules/seo";
import { SeoEditor } from "./editor";
export default async function SeoPage() {
  await requireAdminPage("settings.brand.edit");
  const [t, config] = await Promise.all([
    getTranslations("seoAdmin"),
    getSeoSettings(),
  ]);
  return (
    <div className="grid min-w-0 gap-5">
      <h1>{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <SeoEditor config={config} />
    </div>
  );
}
