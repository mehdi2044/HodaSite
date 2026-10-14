"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function HeaderFrame({
  children,
  style,
}: {
  children: React.ReactNode;
  style: string;
}) {
  const pathname = usePathname();
  const home = /^\/(fa|tr|en)(?:\/m\/[^/]+)?\/?$/.test(pathname);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 40);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  return (
    <header
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
