"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { HomepageBlock } from "@/modules/content/homepage";
import { measureHeroSlide } from "@/modules/content/hero-dom";
import { layoutHeroSlide } from "@/components/storefront/use-hero-layout-guard";

const sizes = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900],
] as const;
type Warning = { rule: string; mode: string };
/** Isolated same-origin, authorized private renders. Never changes the saved draft. */
export function HeroLayoutAudit({
  blocks,
  marketId,
  scopeMarketId,
  markets,
}: {
  blocks: HomepageBlock[];
  marketId?: string;
  scopeMarketId: string | null;
  markets: { id: string; code: string; enabledLocales: string[] }[];
}) {
  const t = useTranslations("modaAdmin");
  const frame = useRef<HTMLIFrameElement>(null);
  const [running, setRunning] = useState(false),
    [warnings, setWarnings] = useState<Warning[]>([]),
    [status, setStatus] = useState<"idle" | "ok" | "failed">("idle");
  const epoch = useRef(0);
  const channels = useRef<Record<string, string>>({});
  const [unavailableLocales, setUnavailableLocales] = useState<string[]>([]);
  useEffect(() => {
    epoch.current++;
    setStatus("idle");
    setWarnings([]);
    setUnavailableLocales([]);
    setRunning(false);
  }, [blocks, marketId, scopeMarketId]);
  const audit = async () => {
    if (!marketId || !frame.current) return;
    const current = ++epoch.current;
    setRunning(true);
    setWarnings([]);
    setStatus("idle");
    const found: Warning[] = [];
    const unavailable: string[] = [];
    try {
      for (const locale of ["fa", "tr", "en"] as const) {
        const choices = markets.filter(
          (m) => !scopeMarketId || m.id === scopeMarketId,
        );
        const previewMarket =
          choices.find(
            (m) => m.id === marketId && m.enabledLocales.includes(locale),
          ) ?? choices.find((m) => m.enabledLocales.includes(locale));
        if (!previewMarket) {
          unavailable.push(locale);
          continue;
        }
        const key = `${scopeMarketId ?? "global"}:${previewMarket.id}:${locale}`;
        const channel = (channels.current[key] ??= crypto.randomUUID());
        const response = await fetch("/api/admin/homepage/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            scopeMarketId,
            marketId: previewMarket.id,
            locale,
            blocks,
            sequence: current,
          }),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
        const iframe = frame.current!;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            iframe.onload = null;
            reject(new Error("PREVIEW_TIMEOUT"));
          }, 30000);
          iframe.onload = () => {
            clearTimeout(timeout);
            iframe.onload = null;
            resolve();
          };
          iframe.src = `/admin/preview/homepage?${new URLSearchParams({ channel })}`;
        });
        const doc = iframe.contentDocument!;
        // Offscreen frames defer lazy images and their own animation frames.
        // Force their layout/assets, then schedule from the visible admin page.
        doc.documentElement.getBoundingClientRect();
        await doc.fonts.ready;
        const root = doc.querySelector(
          "[data-testid=private-homepage-preview]",
        );
        if (!root || root.getAttribute("lang") !== locale)
          throw new Error("PREVIEW_UNAVAILABLE");
        const images = [
          ...doc.querySelectorAll<HTMLImageElement>(".m4-media img"),
        ];
        for (const image of images) image.loading = "eager";
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("PREVIEW_IMAGES_TIMEOUT")),
            20000,
          );
          Promise.all(
            images.map((img) => img.decode().catch(() => undefined)),
          ).then(
            () => {
              clearTimeout(timeout);
              resolve();
            },
            (error: unknown) => {
              clearTimeout(timeout);
              reject(error);
            },
          );
        });
        for (const [width, height] of sizes) {
          if (epoch.current !== current) return;
          iframe.style.width = `${width}px`;
          iframe.style.height = `${height}px`;
          await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          );
          for (const hero of doc.querySelectorAll<HTMLElement>(
            "[data-moda4=hero]",
          )) {
            const slides = [
              ...hero.querySelectorAll<HTMLElement>(".moda-carousel-slide"),
            ];
            const hidden = slides.map((s) => s.hidden);
            try {
              for (let index = 0; index < slides.length; index++) {
                slides.forEach((s, i) => {
                  s.hidden = i !== index;
                });
                const slide = slides[index].querySelector<HTMLElement>(
                  "[data-moda4=hero-slide]",
                );
                if (!slide) continue;
                // Two passes settle the copy height if a price strip becomes necessary.
                layoutHeroSlide(slide);
                layoutHeroSlide(slide);
                const result = measureHeroSlide(slide);
                for (const rule of result.violations)
                  found.push({
                    rule,
                    mode: `${locale} · ${previewMarket.code} · ${width}×${height} · ${index + 1} · ${result.mode}`,
                  });
              }
            } finally {
              slides.forEach((s, i) => {
                s.hidden = hidden[i];
              });
            }
          }
        }
      }
      if (epoch.current === current) {
        setWarnings(found);
        setUnavailableLocales(unavailable);
        setStatus("ok");
      }
    } catch {
      if (epoch.current === current) setStatus("failed");
    } finally {
      if (epoch.current === current) setRunning(false);
    }
  };
  return (
    <div className="grid gap-2" data-testid="hero-layout-audit">
      <button
        type="button"
        className="button button-outline"
        disabled={running || !marketId}
        onClick={() => void audit()}
      >
        {t(running ? "heroAuditRunning" : "heroAudit")}
      </button>
      <div role="status">
        {status === "failed"
          ? t("heroAuditFailed")
          : status === "ok" && !warnings.length && !unavailableLocales.length
            ? t("heroAuditPassed")
            : null}
      </div>
      {unavailableLocales.map((locale) => (
        <p key={locale}>{t("heroAuditLocaleUnavailable", { locale })}</p>
      ))}
      <ul>
        {warnings.map((warning, i) => (
          <li key={i}>{t("heroLayoutWarning", warning)}</li>
        ))}
      </ul>
      <iframe
        ref={frame}
        title={t("heroAudit")}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "fixed",
          left: -20000,
          top: 0,
          width: 390,
          height: 844,
          opacity: 0,
          pointerEvents: "none",
          border: 0,
        }}
      />
    </div>
  );
}
