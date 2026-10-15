"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CommerceForm } from "./commerce-form";
import { savePresentationAction } from "@/app/[locale]/account/presentation-actions";
import { PROFILE_THEMES } from "@/modules/customers/presentation-contract";
type Selection = { theme: string; sizeIds: string[]; categoryIds: string[] };
export function AccountPresentation({
  locale,
  initial,
  revision,
  sizes,
  categories,
}: {
  locale: string;
  initial: Selection;
  revision: number;
  sizes: { id: string; label: string }[];
  categories: { id: string; label: string }[];
}) {
  const t = useTranslations("accountDesign");
  const [value, setValue] = useState(initial),
    [baseline, setBaseline] = useState(JSON.stringify(initial)),
    [version, setVersion] = useState(revision);
  const dirty = JSON.stringify(value) !== baseline;
  useEffect(() => {
    if (!dirty && revision > version) {
      setValue(initial);
      setBaseline(JSON.stringify(initial));
      setVersion(revision);
    }
  }, [initial, revision, version, dirty]);
  const toggle = (key: "sizeIds" | "categoryIds", id: string) =>
    setValue((old) => ({
      ...old,
      [key]: old[key].includes(id)
        ? old[key].filter((item) => item !== id)
        : [...old[key], id],
    }));
  return (
    <section id="appearance" className="moda-account-panel">
      <h2>{t("appearance")}</h2>
      <p>{t("directTheme")}</p>
      {dirty && revision > version && <p role="status">{t("conflict")}</p>}
      <CommerceForm
        action={async (form) => {
          const result = await savePresentationAction(locale, form);
          if (result.ok && result.version !== undefined) {
            const saved =
              form.get("intent") === "clear"
                ? { theme: "", sizeIds: [], categoryIds: [] }
                : value;
            setValue(saved);
            setBaseline(JSON.stringify(saved));
            setVersion(result.version);
          }
          return result;
        }}
      >
        <input type="hidden" name="expectedVersion" value={version} />
        <fieldset className="moda-profile-theme-options">
          <legend>{t("theme")}</legend>
          {["", ...PROFILE_THEMES].map((theme) => (
            <label key={theme} data-theme-choice={theme || "NEUTRAL"}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={value.theme === theme}
                onChange={() => setValue((old) => ({ ...old, theme }))}
              />
              {t(`themes.${theme || "NEUTRAL"}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="moda-preference-chips">
          <legend>{t("sizes")}</legend>
          {sizes.map((size) => (
            <label key={size.id}>
              <input
                type="checkbox"
                name="sizeIds"
                value={size.id}
                checked={value.sizeIds.includes(size.id)}
                onChange={() => toggle("sizeIds", size.id)}
              />
              <bdi>{size.label}</bdi>
            </label>
          ))}
          {!sizes.length && <p>{t("noSizes")}</p>}
        </fieldset>
        <fieldset className="moda-preference-chips">
          <legend>{t("interests")}</legend>
          {categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                name="categoryIds"
                value={category.id}
                checked={value.categoryIds.includes(category.id)}
                onChange={() => toggle("categoryIds", category.id)}
              />
              {category.label}
            </label>
          ))}
        </fieldset>
        <button className="button" name="intent" value="save">
          {t("save")}
        </button>
        <details>
          <summary>{t("clear")}</summary>
          <p>{t("clearHelp")}</p>
          <label>
            <input type="checkbox" name="confirmClear" />
            {t("confirmClear")}
          </label>
          <button className="button button-outline" name="intent" value="clear">
            {t("clear")}
          </button>
        </details>
      </CommerceForm>
    </section>
  );
}
