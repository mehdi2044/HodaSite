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
  ariaLabel,
  mobile = false,
}: {
  current: string;
  enabledLocales: string[];
  ariaLabel: string;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const rest = pathname.split("/").slice(2).join("/");

  return (
    <nav
      aria-label={ariaLabel}
      className={
        mobile
          ? "flex flex-wrap gap-1 text-base"
          : "hidden gap-1 text-sm lg:flex"
      }
    >
      {enabledLocales.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}/${rest}`}
          aria-current={locale === current ? "true" : undefined}
          className={`flex min-h-11 items-center rounded-full px-3 ${locale === current ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
        >
          {LABELS[locale] ?? locale}
        </Link>
      ))}
    </nav>
  );
}
