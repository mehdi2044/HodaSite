"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { PublicMenuItem } from "@/modules/content";
import { useTranslations } from "next-intl";
import { ResponsiveImage, isDemoFashionMedia } from "./responsive-image";
import { menuLinkIsActive } from "@/lib/menu-active";

export function MegaNavigation({
  items,
  locale,
  mobile = false,
}: {
  items: PublicMenuItem[];
  locale: "fa" | "tr" | "en";
  mobile?: boolean;
}) {
  const t = useTranslations("contentNavigation");
  const shopping = useTranslations("shopping");
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pathname = usePathname();
  // Rewrites may expose a different server pathname. Apply active decoration
  // after commit so it never changes the server/client hydration contract.
  const [activePath, setActivePath] = useState<string | null>(null);
  useEffect(() => {
    setOpen(null);
    setActivePath(pathname);
  }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <nav
      ref={root}
      className={mobile ? "moda-mega-mobile" : "moda-mega"}
      aria-label={t("main")}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          buttons.current.get(open)?.focus();
          setOpen(null);
          event.preventDefault();
        }
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="moda-mega-item"
          onPointerEnter={(event) => {
            if (
              event.pointerType === "mouse" &&
              !mobile &&
              (item.children.length || item.image)
            )
              setOpen(item.id);
          }}
        >
          <div className="moda-menu-root">
            {item.href ? (
              <Link
                href={item.href}
                title={item.label}
                aria-current={
                  menuLinkIsActive(item.href, activePath) ? "page" : undefined
                }
                target={item.target}
                rel={
                  item.target === "_blank" ? "noopener noreferrer" : undefined
                }
              >
                {item.label}
              </Link>
            ) : (
              <span aria-disabled="true">{item.label}</span>
            )}
            {(item.children.length > 0 || item.image) && (
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(item.id, node);
                  else buttons.current.delete(item.id);
                }}
                aria-label={t("openMenu", { label: item.label })}
                aria-expanded={open === item.id}
                aria-controls={`menu-panel-${mobile ? "mobile" : "desktop"}-${item.id}`}
                onClick={() => setOpen(open === item.id ? null : item.id)}
              >
                ⌄
              </button>
            )}
          </div>
          {(item.children.length > 0 || item.image) && (
            <div
              id={`menu-panel-${mobile ? "mobile" : "desktop"}-${item.id}`}
              hidden={open !== item.id}
              className="moda-mega-panel"
            >
              <div className="moda-mega-links">
                {item.children.map((child) =>
                  child.href ? (
                    <Link
                      key={child.id}
                      href={child.href}
                      title={child.label}
                      aria-current={
                        menuLinkIsActive(child.href, activePath)
                          ? "page"
                          : undefined
                      }
                      target={child.target}
                      rel={
                        child.target === "_blank"
                          ? "noopener noreferrer"
                          : undefined
                      }
                    >
                      {child.label}
                    </Link>
                  ) : (
                    <span key={child.id} aria-disabled="true">
                      {child.label}
                    </span>
                  ),
                )}
              </div>
              {item.image && (
                <Link
                  href={
                    item.href ??
                    item.children.find((child) => child.href)?.href ??
                    `/${locale}/search`
                  }
                  className="moda-menu-tile"
                  style={{
                    backgroundColor: `var(--${item.presentation?.tone ?? "sand"})`,
                  }}
                >
                  <ResponsiveImage
                    media={{ ...item.image, presentation: item.presentation }}
                    locale={locale}
                    sizes="(min-width:1024px) 300px,180px"
                    role="editorial"
                    imgClassName="h-full w-full"
                  />
                  <strong>{item.label}</strong>
                  {isDemoFashionMedia(item.image) && (
                    <small>{shopping("demoImage")}</small>
                  )}
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
