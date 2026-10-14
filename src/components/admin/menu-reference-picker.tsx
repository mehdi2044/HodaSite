"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
type Option = { id: string; titleI18n: unknown };

/** Choose catalog entities by their labels rather than typing internal IDs. */
export function MenuReferencePicker({
  initial,
  categories,
  collections,
  pages,
  locale,
}: {
  initial: {
    linkType: string;
    url: string | null;
    pageId: string | null;
    referenceId: string | null;
  };
  categories: Option[];
  collections: Option[];
  pages: Option[];
  locale: string;
}) {
  const t = useTranslations("contentAdmin"),
    [kind, setKind] = useState(initial.linkType);
  const options =
    kind === "page" ? pages : kind === "category" ? categories : collections;
  const label = (option: Option) => {
    const title = option.titleI18n as Record<string, string>;
    return title[locale] || title.en || title.fa || option.id;
  };
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <label>
        {t("linkType")}
        <select
          className="input"
          name="linkType"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="url">{t("urlLabel")}</option>
          <option value="page">{t("page")}</option>
          <option value="category">{t("categoryPhase2")}</option>
          <option value="collection">{t("collectionPhase2")}</option>
        </select>
      </label>
      {kind === "url" ? (
        <label>
          {t("urlLabel")}
          <input
            className="input"
            name="url"
            dir="ltr"
            defaultValue={initial.url ?? "/"}
            required
          />
        </label>
      ) : (
        <label>
          {kind === "page" ? t("page") : t("reference")}
          <select
            key={kind}
            className="input"
            name={kind === "page" ? "pageId" : "referenceId"}
            defaultValue={
              kind === "page"
                ? (initial.pageId ?? "")
                : (initial.referenceId ?? "")
            }
            required
          >
            <option value="">—</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {label(option)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
