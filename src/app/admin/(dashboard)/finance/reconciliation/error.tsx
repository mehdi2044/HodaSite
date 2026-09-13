"use client";
import { useTranslations } from "next-intl";
export default function ReconciliationError({ reset }: { reset: () => void }) {
  const t = useTranslations("reconciliation");
  return (
    <section className="finance-page">
      <h1>{t("title")}</h1>
      <p role="alert">{t("loadError")}</p>
      <button className="button" onClick={reset}>
        {t("retry")}
      </button>
    </section>
  );
}
