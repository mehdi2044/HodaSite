"use client";
import { useTranslations } from "next-intl";
export default function LaunchError({ reset }: { reset: () => void }) {
  const t = useTranslations("launch");
  return (
    <section className="card grid gap-3">
      <h1>{t("title")}</h1>
      <p role="alert">{t("error")}</p>
      <button className="button min-h-11 w-fit" onClick={reset}>
        {t("retry")}
      </button>
    </section>
  );
}
