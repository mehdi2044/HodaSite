import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { aiSettings } from "@/modules/ai/settings";
import { AiSettingsForm } from "@/components/admin/ai-settings";
export default async function Page() {
  const [t, v] = await Promise.all([getTranslations("aiAdmin"), aiSettings()]);
  return (
    <div className="grid max-w-5xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("settings")}</h1>
        <p className="mt-2 text-muted">{t("settingsHelp")}</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Link className="button" href="/admin/ai/usage">
          {t("usage")}
        </Link>
        <Link className="button" href="/admin/ai/review">
          {t("queue")}
        </Link>
      </div>
      <AiSettingsForm
        initial={v.config}
        keys={v.keys}
        prompts={v.prompts.map((p) => ({
          feature: p.feature,
          style: p.style,
          forbiddenClaims: p.forbiddenClaims,
        }))}
      />
    </div>
  );
}
