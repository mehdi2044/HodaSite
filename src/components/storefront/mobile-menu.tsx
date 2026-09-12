"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { StorefrontIcon } from "./storefront-icon";
/** Native disclosure semantics, with predictable close/focus behavior. */
export function MobileMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        ref.current
      )
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={ref}
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        for (const other of event.currentTarget
          .closest("header")
          ?.querySelectorAll<HTMLDetailsElement>("details[open]") ?? [])
          if (other !== event.currentTarget) other.open = false;
      }}
      className="storefront-mobile-menu lg:hidden"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("a") &&
          ref.current
        )
          ref.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
          event.preventDefault();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary aria-label={label} className="storefront-menu-toggle">
        <StorefrontIcon name="menu" />
      </summary>
      <nav className="storefront-menu-panel" aria-label={label}>
        {children}
      </nav>
    </details>
  );
}
