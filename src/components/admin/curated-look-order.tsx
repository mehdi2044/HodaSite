"use client";

import { useTranslations } from "next-intl";

/** Ordered references to the existing editorial CMS; never copies look content. */
export function CuratedLookOrder({
  value,
  choices,
  change,
}: {
  value: string[];
  choices: { id: string; title: string }[];
  change: (ids: string[]) => void;
}) {
  const t = useTranslations("modaAdmin");
  function move(index: number, delta: number) {
    const next = [...value];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  }
  return (
    <fieldset className="grid gap-3 rounded-token border p-3">
      <legend>{t("curatedSelection")}</legend>
      <p>{t("curatedSelectionHelp")}</p>
      {value.map((id, index) => (
        <div className="flex flex-wrap gap-2" key={id}>
          <select
            className="input"
            aria-label={`${t("curatedSelection")} ${index + 1}`}
            value={id}
            onChange={(event) =>
              change(
                value.map((item, n) =>
                  n === index ? event.target.value : item,
                ),
              )
            }
          >
            {!choices.some((choice) => choice.id === id) && (
              <option value={id}>{t("missingSource")}</option>
            )}
            {choices
              .filter(
                (choice) => choice.id === id || !value.includes(choice.id),
              )
              .map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="button button-outline"
            disabled={index === 0}
            onClick={() => move(index, -1)}
            aria-label={t("moveUp")}
          >
            ↑
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={index === value.length - 1}
            onClick={() => move(index, 1)}
            aria-label={t("moveDown")}
          >
            ↓
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => change(value.filter((_, n) => n !== index))}
          >
            {t("remove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-outline"
        disabled={
          value.length >= 12 ||
          choices.every((choice) => value.includes(choice.id))
        }
        onClick={() => {
          const next = choices.find((choice) => !value.includes(choice.id));
          if (next) change([...value, next.id]);
        }}
      >
        {t("addLook")}
      </button>
      <a href="/admin/content/editorial">{t("editCuratedLooks")}</a>
    </fieldset>
  );
}
