"use client";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminLocale } from "@/app/admin/(dashboard)/security/actions";
export function AdminLocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("adminShell");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  return (
    <label className="grid gap-1 min-w-32 text-sm">
      {t("language")}
      <select
        className="input text-text bg-surface min-h-11"
        name="adminLocale"
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const form = new FormData();
          form.set("locale", event.target.value);
          start(async () => {
            setError(false);
            try {
              await setAdminLocale(form);
              router.refresh();
            } catch {
              setError(true);
            }
          });
        }}
      >
        {(["fa", "tr", "en"] as const).map((code) => (
          <option key={code} value={code}>
            {t(code)}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-error">
          {t("languageError")}
        </span>
      )}
    </label>
  );
}
