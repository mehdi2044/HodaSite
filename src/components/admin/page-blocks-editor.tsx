"use client";

import { useState } from "react";
import { MediaPicker } from "@/components/admin/media-picker";

export function PageBlocksEditor({
  defaultValue,
  label,
  help,
  mediaLabel,
}: {
  defaultValue: unknown;
  label: string;
  help: string;
  mediaLabel: string;
}) {
  const [value, setValue] = useState(JSON.stringify(defaultValue, null, 2));
  function addImage(mediaId: string) {
    try {
      const parsed = JSON.parse(value) as unknown;
      const blocks = Array.isArray(parsed) ? parsed : [];
      setValue(
        JSON.stringify(
          [
            ...blocks,
            {
              type: "Image",
              mediaId,
              caption: { fa: "", tr: "", en: "" },
            },
          ],
          null,
          2,
        ),
      );
    } catch {
      // Keep invalid draft text intact; server validation will show the
      // localized validation error instead of silently discarding work.
    }
  }
  return (
    <div className="grid gap-3">
      <MediaPicker
        name="blockMediaHelper"
        label={mediaLabel}
        onSelect={addImage}
      />
      <label className="grid gap-1">
        {label}
        <textarea
          className="input min-h-80 font-mono text-sm"
          name="blocks"
          dir="ltr"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </label>
      <p className="muted text-sm">{help}</p>
    </div>
  );
}
