"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  fa: "فارسی",
  tr: "Türkçe",
  en: "English",
};

export function LocaleSwitcher({
  current,
  enabledLocales,
}: {
  current: string;
  enabledLocales: string[];
}) {
  const pathname = usePathname();
  const rest = pathname.split("/").slice(2).join("/");

  return (
    <nav aria-label="زبان" className="flex gap-3 text-sm">
      {enabledLocales.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}/${rest}`}
          aria-current={locale === current ? "true" : undefined}
          className={locale === current ? "font-semibold" : "text-muted"}
        >
          {LABELS[locale] ?? locale}
        </Link>
      ))}
    </nav>
  );
}
