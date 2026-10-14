"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MediaPicker } from "./media-picker";
import {
  menuPresentation,
  MENU_TONES,
} from "@/modules/content/menu-presentation";

/** Unsaved presentation preview shares the public menu's bounded framing. */
export function MenuPresentationEditor({
  initial,
  url,
}: {
  initial: unknown;
  url?: string;
}) {
  const t = useTranslations("contentAdmin");
  const [draft, setDraft] = useState(() => menuPresentation(initial));
  const [image, setImage] = useState(url ?? "");
  const [mobile, setMobile] = useState(true);
  const position = (value: number) =>
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5)) * 100;
  return (
    <div className="grid gap-3">
      <MediaPicker
        name="mediaId"
        label={t("menuImage")}
        defaultMediaId={draft.mediaId}
        defaultUrl={url}
        allowClear
        onSelect={(id, url) => {
          setDraft((value) => ({ ...value, mediaId: id || undefined }));
          setImage(url);
        }}
      />
      <div className="grid gap-2 md:grid-cols-4">
        <label>
          {t("imageFit")}
          <select
            className="input"
            name="imageFit"
            value={draft.fit}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                fit: event.target.value as "cover" | "contain",
              }))
            }
          >
            <option value="cover">{t("cover")}</option>
            <option value="contain">{t("contain")}</option>
          </select>
        </label>
        <label>
          {t("imageTone")}
          <select
            className="input"
            name="imageTone"
            value={draft.tone}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                tone: event.target.value as (typeof MENU_TONES)[number],
              }))
            }
          >
            {MENU_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`tone_${tone}`)}
              </option>
            ))}
          </select>
        </label>
        {(["focalX", "focalY"] as const).map((key) => (
          <label key={key}>
            {t(key)}
            <input
              className="input"
              type="number"
              name={key}
              min="0"
              max="1"
              step="0.01"
              value={draft[key]}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  [key]: Number(event.target.value),
                }))
              }
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="button"
          aria-pressed={mobile}
          onClick={() => setMobile(true)}
        >
          {t("mobilePreview")}
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={!mobile}
          onClick={() => setMobile(false)}
        >
          {t("desktopPreview")}
        </button>
      </div>
      <div
        data-testid="menu-presentation-preview"
        style={{
          maxWidth: mobile ? 180 : 300,
          backgroundColor: `var(--${draft.tone})`,
          aspectRatio: mobile ? "4 / 5" : "3 / 2",
        }}
      >
        {image ? (
          <img
            src={image}
            alt={t("menuImage")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: draft.fit,
              objectPosition: `${position(draft.focalX)}% ${position(draft.focalY)}%`,
            }}
          />
        ) : (
          <p className="p-4 text-muted">{t("noMenuImage")}</p>
        )}
      </div>
    </div>
  );
}
