"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  mediaPresentationSchema,
  mediaPresentation,
} from "@/modules/media/presentation";
export function MediaFramingEditor({
  src,
  value,
}: {
  src: string;
  value: unknown;
}) {
  const t = useTranslations("media");
  const [frame, setFrame] = useState(
    () => mediaPresentationSchema.safeParse(value).data ?? {},
  );
  return (
    <fieldset className="grid gap-3 rounded-token border border-black/10 p-3">
      <legend>{t("framing")}</legend>
      <input type="hidden" name="presentation" value={JSON.stringify(frame)} />
      <div className="mx-auto w-40 aspect-[4/5] overflow-hidden bg-bg">
        <img
          src={src}
          alt={t("framingPreview")}
          className="block h-full w-full"
          style={mediaPresentation(frame, "catalog")}
        />
      </div>
      <label>
        {t("imageFit")}
        <select
          className="input"
          value={frame.fit ?? "cover"}
          onChange={(e) =>
            setFrame({ ...frame, fit: e.target.value as "cover" | "contain" })
          }
        >
          <option value="cover">{t("fitCover")}</option>
          <option value="contain">{t("fitContain")}</option>
        </select>
      </label>
      {(["focalX", "focalY"] as const).map((key) => (
        <label key={key} className="grid gap-1">
          {t(key)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={frame[key] ?? (key === "focalX" ? 0.5 : 0)}
            onChange={(e) =>
              setFrame({ ...frame, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <p className="text-xs text-muted">{t("framingHelp")}</p>
    </fieldset>
  );
}
