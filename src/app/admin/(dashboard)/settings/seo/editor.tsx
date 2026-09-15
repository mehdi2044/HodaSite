"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SEO_LOCALES, type SeoSettings } from "@/lib/seo";
import { saveSeo } from "./actions";
export function SeoEditor({ config }: { config: SeoSettings }) {
  const t = useTranslations("seoAdmin");
  const [state, action, pending] = useActionState(saveSeo, null);
  return (
    <form
      action={action}
      className="card grid min-w-0 max-w-2xl gap-5"
      data-testid="seo-settings"
    >
      <label className="grid gap-2">
        {t("origin")}
        <input
          name="origin"
          type="url"
          dir="ltr"
          maxLength={2048}
          defaultValue={config.origin}
          className="input min-w-0 w-full"
          placeholder="https://shop.example.com"
        />
      </label>
      <p className="text-sm text-muted">{t("originHint")}</p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="indexingEnabled"
          defaultChecked={config.indexingEnabled}
          className="mt-1"
        />
        {t("indexing")}
      </label>
      <p className="text-sm text-muted">{t("indexingHint")}</p>
      {SEO_LOCALES.map((locale) => (
        <fieldset key={locale} className="grid min-w-0 gap-3 border-t pt-4">
          <legend className="font-semibold">{t(locale)}</legend>
          <label className="grid gap-1">
            {t("defaultTitle")}
            <input
              name={`title_${locale}`}
              dir={locale === "fa" ? "rtl" : "ltr"}
              maxLength={500}
              defaultValue={config.title[locale]}
              className="input min-w-0 w-full"
            />
          </label>
          <label className="grid gap-1">
            {t("description")}
            <textarea
              name={`description_${locale}`}
              dir={locale === "fa" ? "rtl" : "ltr"}
              maxLength={500}
              defaultValue={config.description[locale]}
              className="input min-w-0 w-full"
              rows={3}
            />
          </label>
        </fieldset>
      ))}
      <label className="grid gap-1">
        {t("googleVerification")}
        <input
          name="googleVerification"
          dir="ltr"
          maxLength={200}
          defaultValue={config.googleVerification}
          className="input min-w-0 w-full"
        />
      </label>
      <p className="text-sm text-muted">{t("verificationHint")}</p>
      {state && (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "text-success" : "text-error"}
        >
          {state.ok ? t("saved") : state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="button min-h-11 w-fit"
      >
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}
