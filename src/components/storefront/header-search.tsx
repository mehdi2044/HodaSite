"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { StorefrontIcon } from "./storefront-icon";
import { SearchBox } from "./search-box";
import { useTranslations } from "next-intl";

export function HeaderSearch({
  locale,
  marketId,
  marketCode,
}: {
  locale: "fa" | "tr" | "en";
  marketId: string;
  marketCode: string;
}) {
  const t = useTranslations("catalog"),
    navigation = useTranslations("shopping");
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="moda-tool"
        aria-label={t("search")}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          dialog.current
            ?.querySelector<HTMLInputElement>('input[type="search"]')
            ?.focus();
        }}
      >
        <StorefrontIcon name="search" />
      </button>
      <dialog
        ref={dialog}
        className="moda-search-dialog"
        aria-label={t("search")}
        onClose={() => trigger.current?.focus()}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dialog.current?.close();
          }
        }}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className="moda-tool"
          onClick={() => dialog.current?.close()}
        >
          {navigation("close")}
        </button>
        <SearchBox
          locale={locale}
          marketId={marketId}
          marketCode={marketCode}
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          initial=""
        />
      </dialog>
    </>
  );
}
