"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  titleI18n: Record<string, string>;
  slugI18n: Record<string, string>;
};
export function SearchBox({
  locale,
  marketId,
  label,
  placeholder,
  initial,
}: {
  locale: "fa" | "tr" | "en";
  marketId: string;
  label: string;
  placeholder: string;
  initial: string;
}) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(
          `/api/catalog/suggest?q=${encodeURIComponent(q)}&market=${encodeURIComponent(marketId)}`,
          { signal: controller.signal },
        )
          .then((r) => r.json())
          .then((data: { items: Item[] }) => setItems(data.items))
          .catch(() => {}),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, marketId]);
  return (
    <div className="relative max-w-2xl">
      <form className="my-7 flex gap-2">
        <input
          aria-label={placeholder}
          type="search"
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="h-12 flex-1 rounded-[10px] border border-black/15 px-4"
          placeholder={placeholder}
        />
        <button className="button">{label}</button>
      </form>
      {items.length > 0 && (
        <ul className="absolute inset-x-0 top-14 z-20 rounded-token border bg-surface p-2 shadow-xl">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className="block min-h-11 rounded-[8px] px-3 py-3 hover:bg-bg"
                href={`/${locale}/p/${encodeURIComponent(item.slugI18n[locale] || item.slugI18n.en)}`}
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
