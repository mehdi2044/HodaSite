"use client";
import { useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
export function ShopSheet({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    t = useTranslations("shopping");
  return (
    <div className="shop-sheet-wrap">
      <button
        type="button"
        className="shop-filter-toggle"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
      >
        {title}
        <span aria-hidden="true">＋</span>
      </button>
      <dialog
        ref={ref}
        className="shop-sheet"
        aria-labelledby={id}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        <div className="shop-sheet-head">
          <h2 id={id}>{title}</h2>
          <button type="button" onClick={() => ref.current?.close()}>
            {t("close")}
          </button>
        </div>
        <div onSubmit={() => ref.current?.close()}>{children}</div>
      </dialog>
    </div>
  );
}
