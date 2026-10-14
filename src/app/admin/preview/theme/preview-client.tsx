"use client";
import { useEffect } from "react";
import {
  safeColorMap,
  safeCssLength,
  safeLineOpacity,
  themeFontVars,
  BUTTON_STYLES,
} from "@/lib/theme-validation";
import { DEFAULT_LIGHT_COLORS, BUTTON_RADIUS } from "@/lib/theme-defaults";

/**
 * Applies theme overrides pushed from the editor via postMessage, live,
 * without writing anything (Phase 01a §3: "Preview route must be admin-only
 * and must not write anything"). Origin-checked both ways.
 */
export function ThemePreviewClient({
  children,
  channel,
}: {
  children: React.ReactNode;
  channel: string;
}) {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.source !== window.parent || !channel || e.data?.channel !== channel)
        return;
      if (e.data?.type !== "theme-preview") return;
      const { vars, buttonStyle, fonts, lineOpacity } = e.data as {
        vars?: Record<string, string>;
        buttonStyle?: string;
        fonts?: unknown;
        lineOpacity?: unknown;
      };
      const root = document.documentElement;
      for (const [k, v] of Object.entries(
        safeColorMap(vars, DEFAULT_LIGHT_COLORS),
      ))
        root.style.setProperty(`--${k}`, v);
      for (const [k, v] of Object.entries(themeFontVars(fonts)))
        root.style.setProperty(`--${k}`, v);
      root.style.setProperty("--radius", safeCssLength(vars?.radius, "12px"));
      const style =
        BUTTON_STYLES.find((value) => value === buttonStyle) ?? "pill";
      root.style.setProperty("--radius-button", BUTTON_RADIUS[style]);
      root.style.setProperty(
        "--line-opacity",
        String(safeLineOpacity({ opacity: { line: lineOpacity } })),
      );
      root.dataset.buttonStyle = style;
    }
    window.addEventListener("message", onMessage);
    // Tell the parent we're ready so it can (re)send the current draft even
    // if it posted before this iframe finished loading.
    window.parent?.postMessage(
      { type: "theme-preview-ready", channel },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, [channel]);

  return <>{children}</>;
}
