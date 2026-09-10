"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CartDrawer({
  locale,
  items,
  currency,
}: {
  locale: string;
  items: { title: string; quantity: number }[];
  currency: string;
}) {
  const t = useTranslations("commerce");
  return (
    <details className="relative">
      <summary className="cursor-pointer py-3">
        {t("cart")} ({items.reduce((n, i) => n + i.quantity, 0)})
      </summary>
      <section className="absolute end-0 top-full z-50 grid w-[min(22rem,90vw)] gap-4 rounded-token border border-black/10 bg-surface p-5 shadow-xl">
        <h2 className="font-semibold">
          {t("cart")} · {currency}
        </h2>
        {items.length ? (
          items.slice(0, 5).map((i, n) => (
            <p key={n}>
              {i.title} × {i.quantity}
            </p>
          ))
        ) : (
          <p className="text-muted">{t("empty")}</p>
        )}
        <Link className="button text-center" href={`/${locale}/cart`}>
          {t("viewCart")}
        </Link>
      </section>
    </details>
  );
}
