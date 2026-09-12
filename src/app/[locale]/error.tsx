"use client";
import { useTranslations } from "next-intl";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations("shopping");
  return (
    <main className="shell shop-empty">
      <h1>{t("errorTitle")}</h1>
      <p role="alert">{t("errorBody")}</p>
      <button className="button" onClick={reset}>
        {t("retry")}
      </button>
    </main>
  );
}
