"use client";
import { useEffect } from "react";

/**
 * Applies theme overrides pushed from the editor via postMessage, live,
 * without writing anything (Phase 01a §3: "Preview route must be admin-only
 * and must not write anything"). Origin-checked both ways.
 */
export function ThemePreviewClient({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "theme-preview") return;
      const { vars, buttonStyle } = e.data as {
        vars?: Record<string, string>;
        buttonStyle?: string;
      };
      const root = document.documentElement;
      for (const [k, v] of Object.entries(vars ?? {}))
        root.style.setProperty(`--${k}`, v);
      if (buttonStyle) root.dataset.buttonStyle = buttonStyle;
    }
    window.addEventListener("message", onMessage);
    // Tell the parent we're ready so it can (re)send the current draft even
    // if it posted before this iframe finished loading.
    window.parent?.postMessage(
      { type: "theme-preview-ready" },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <>{children}</>;
}
