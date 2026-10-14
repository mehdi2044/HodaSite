"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function HeaderFrame({
  children,
  style,
}: {
  children: React.ReactNode;
  style: string;
}) {
  const pathname = usePathname();
  const header = useRef<HTMLElement>(null);
  const home = /^\/(fa|tr|en)(?:\/m\/[^/]+)?\/?$/.test(pathname);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 40);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("--storefront-header-height");
    let measured = "";
    const update = () => {
      const height = header.current?.getBoundingClientRect().height;
      if (height) {
        measured = `${height}px`;
        style.setProperty("--storefront-header-height", measured);
      }
    };
    const observer = new ResizeObserver(update);
    if (header.current) observer.observe(header.current);
    update();
    return () => {
      observer.disconnect();
      if (style.getPropertyValue("--storefront-header-height") === measured) {
        if (previous) style.setProperty("--storefront-header-height", previous);
        else style.removeProperty("--storefront-header-height");
      }
    };
  }, []);
  return (
    <header
      ref={header}
      className="moda-header"
      data-header-style={style}
      data-home={home}
      data-scrolled={scrolled}
    >
      {children}
      <div className="moda-lace" aria-hidden="true" />
    </header>
  );
}
