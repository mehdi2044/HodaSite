"use client";
import { useTranslations } from "next-intl";
export default function FinanceError({ reset }: { reset: () => void }) {
  const t = useTranslations("finance");
  return (
    <section className="finance-page">
      <h1>{t("title")}</h1>
      <p role="alert">{t("error")}</p>
      <button className="button" onClick={reset}>
        {t("retry")}
      </button>
    </section>
  );
}
