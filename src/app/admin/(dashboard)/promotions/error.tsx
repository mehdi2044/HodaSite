"use client";
import { useTranslations } from "next-intl";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations("crm");
  return (
    <section className="card grid gap-3">
      <p role="alert">{t("error")}</p>
      <button className="button" onClick={reset}>
        {t("retry")}
      </button>
    </section>
  );
}
