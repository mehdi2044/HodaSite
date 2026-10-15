"use client";
import { useTranslations } from "next-intl";
export function AccountProgress({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations("accountDesign");
  return (
    <ol className="moda-auth-progress" aria-label={t("progress")}>
      {(["email", "code", "profile"] as const).map((label, index) => (
        <li
          key={label}
          aria-current={step === index + 1 ? "step" : undefined}
          data-complete={step > index + 1}
        >
          <span aria-hidden="true">{index + 1}</span>
          {t(`steps.${label}`)}
        </li>
      ))}
    </ol>
  );
}
