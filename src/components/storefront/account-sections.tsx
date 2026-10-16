"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
const panels = {
  overview: "overview",
  wardrobe: "overview",
  appearance: "appearance",
  orders: "orders",
  "personal-details": "details",
  addresses: "details",
} as const;
type Section = keyof typeof panels;
export function AccountSections({
  locale,
  defaultDetails,
  labels,
  overview,
  appearance,
  orders,
  details,
}: {
  locale: string;
  defaultDetails: boolean;
  labels: Record<Section | "navigation" | "wishlist" | "privacy", string>;
  overview: ReactNode;
  appearance: ReactNode;
  orders: ReactNode;
  details: ReactNode;
}) {
  const fallback: Section = defaultDetails ? "personal-details" : "overview";
  const [section, setSection] = useState<Section>(fallback);
  useEffect(() => {
    const read = () => {
      const id = location.hash.slice(1);
      setSection(Object.hasOwn(panels, id) ? (id as Section) : fallback);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [fallback]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.getElementById(section)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [section]);
  const current = panels[section];
  return (
    <div className="moda-account-layout">
      <nav className="moda-account-nav" aria-label={labels.navigation}>
        {(
          [
            "overview",
            "orders",
            "wardrobe",
            "appearance",
            "personal-details",
            "addresses",
          ] as const
        ).map((id) => (
          <Link
            key={id}
            href={`#${id}`}
            scroll={false}
            aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}
          >
            {labels[id]}
          </Link>
        ))}
        <Link href={`/${locale}/account/wishlist`}>{labels.wishlist}</Link>
        <Link href={`/${locale}/account/preferences`}>{labels.privacy}</Link>
      </nav>
      <div className="moda-account-content">
        {Object.entries({ overview, appearance, orders, details }).map(
          ([id, content]) => (
            <div key={id} data-account-view={id} hidden={current !== id}>
              {content}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
