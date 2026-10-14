"use client";

import Link from "next/link";
import { seoPath } from "@/lib/seo-urls";
import { useEffect, useState, useRef } from "react";

type Item = {
  id: string;
  titleI18n: Record<string, string>;
  slugI18n: Record<string, string>;
};
export function SearchBox({
  locale,
  marketId,
  marketCode,
  label,
  placeholder,
  initial,
  collectionId,
}: {
  locale: "fa" | "tr" | "en";
  marketId: string;
  marketCode: string;
  label: string;
  placeholder: string;
  initial: string;
  collectionId?: string;
}) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const sequence = useRef(0);
  useEffect(() => {
    const turn = ++sequence.current;
    setItems([]);
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(
          `/api/catalog/suggest?q=${encodeURIComponent(q)}&market=${encodeURIComponent(marketId)}${collectionId ? `&collectionId=${encodeURIComponent(collectionId)}` : ""}`,
          { signal: controller.signal },
        )
          .then((r) => r.json())
          .then((data: { items: Item[] }) => {
            if (!controller.signal.aborted && sequence.current === turn)
              setItems(data.items);
          })
          .catch(() => {}),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, marketId, collectionId]);
  return (
    <div className="relative max-w-2xl">
      <form
        action={`/${locale}/search`}
        method="get"
        className="my-7 flex gap-2"
      >
        {collectionId && (
          <input type="hidden" name="collectionId" value={collectionId} />
        )}
        <input
          aria-label={placeholder}
          type="search"
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="h-12 min-w-0 flex-1 rounded-[10px] border border-black/15 px-4"
          placeholder={placeholder}
        />
        <button className="button">{label}</button>
      </form>
      {items.length > 0 && (
        <ul
          data-testid="search-suggestions"
          className="absolute inset-x-0 top-14 z-20 rounded-token border bg-surface p-2 shadow-xl"
        >
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className="block min-h-11 rounded-[8px] px-3 py-3 hover:bg-bg"
                href={seoPath(
                  locale,
                  marketCode,
                  "p",
                  item.slugI18n[locale] || item.slugI18n.en,
                )}
              >
                {item.titleI18n[locale] || item.titleI18n.en}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
