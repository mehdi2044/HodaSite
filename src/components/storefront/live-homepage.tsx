"use client";
import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
/** One current-data refresh per visible homepage; no provider calls or client price math. */
export function LiveHomepage({
  children,
  preview,
}: {
  children: ReactNode;
  preview: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    router = useRouter(),
    [pending, refresh] = useTransition();
  const busy = useRef(pending);
  useEffect(() => {
    busy.current = pending;
  }, [pending]);
  useEffect(() => {
    if (preview) return;
    let visible = false;
    const update = () => {
      if (visible && !document.hidden && !busy.current)
        refresh(() => router.refresh());
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    });
    if (root.current) observer.observe(root.current);
    const timer = setInterval(update, 4000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [preview, router]);
  return <div ref={root}>{children}</div>;
}
