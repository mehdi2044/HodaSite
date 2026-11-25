"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
const subscribe = () => () => {};

/** Presentation only. Price, stock, variants and cart remain in CuratedPurchase. */
export function HomeLookPicker({
  labels,
  panels,
  title,
}: {
  title: string;
  labels: string[];
  panels: ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        section.querySelectorAll("img").forEach((image) => {
          image.loading = "eager";
        });
        observer.disconnect();
      },
      { rootMargin: "320px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [panels]);
  const current = Math.min(active, Math.max(0, labels.length - 1));
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className="home-look-picker" ref={root}>
      <div className="home-look-tabs" role="group" aria-label={title}>
        {labels.map((label, index) => (
          <button
            key={index}
            type="button"
            disabled={!ready}
            aria-pressed={current === index}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                return;
              event.preventDefault();
              const rtl = document.documentElement.dir === "rtl";
              const delta = (event.key === "ArrowRight") !== rtl ? 1 : -1;
              const next = (current + delta + labels.length) % labels.length;
              setActive(next);
              const sibling = event.currentTarget.parentElement?.children[next];
              if (sibling instanceof HTMLButtonElement) sibling.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <div key={index} hidden={current !== index}>
          {panel}
        </div>
      ))}
    </div>
  );
}
