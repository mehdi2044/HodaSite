import type { Market } from "@/lib/request-context";
import { isSafeLink } from "@/modules/content";

export function AnnouncementBar({
  market,
  locale,
}: {
  market: Market;
  locale: string;
}) {
  const bar = (market.announcementBar ?? {}) as {
    enabled?: boolean;
    text?: Record<string, string>;
    link?: string;
  };
  const text = bar.text?.[locale];
  if (!bar.enabled || !text) return null;

  return (
    <div className="bg-primary px-4 text-center text-sm font-medium text-text">
      {bar.link && isSafeLink(bar.link) ? (
        <a
          href={bar.link}
          className="inline-flex min-h-11 items-center text-text underline-offset-2 hover:underline"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </div>
  );
}
