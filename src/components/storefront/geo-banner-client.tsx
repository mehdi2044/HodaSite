"use client";
import { useState } from "react";

const YEAR = 60 * 60 * 24 * 365;
const MONTH = 60 * 60 * 24 * 30;

export function GeoBannerClient({
  marketCode,
  text,
  switchLabel,
  dismissLabel,
}: {
  marketCode: string;
  text: string;
  switchLabel: string;
  dismissLabel: string;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function switchMarket() {
    document.cookie = `market=${marketCode}; path=/; max-age=${YEAR}`;
    window.location.reload();
  }
  function dismiss() {
    document.cookie = `geoBannerDismissed=1; path=/; max-age=${MONTH}`;
    setHidden(true);
  }

  return (
    <div
      role="note"
      className="flex items-center justify-between gap-3 border-b border-black/5 bg-surface px-4 py-2 text-sm"
    >
      <span>{text}</span>
      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={switchMarket}
          className="font-medium text-primary underline"
        >
          {switchLabel}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={dismissLabel}
          className="text-muted"
        >
          ×
        </button>
      </div>
    </div>
  );
}
