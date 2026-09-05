import type { Market } from "@/lib/request-context";

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
    <div className="bg-primary px-4 py-2 text-center text-sm text-white">
      {bar.link ? (
        <a
          href={bar.link}
          className="text-white underline-offset-2 hover:underline"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </div>
  );
}
