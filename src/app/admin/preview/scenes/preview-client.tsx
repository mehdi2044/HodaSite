"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { shoppableSceneSchema } from "@/modules/content/scenes/contracts";
import type { SceneView } from "@/modules/content/scenes/resolve";
import { ShoppableScene } from "@/components/storefront/shoppable-scene";
export function ScenePreviewClient({
  channel,
  scopeMarketId,
  marketId,
  locale,
  frame,
}: {
  channel: string;
  scopeMarketId: string | null;
  marketId: string;
  locale: "fa" | "tr" | "en";
  frame: "desktop" | "mobile";
}) {
  const t = useTranslations("scenes");
  const [view, setView] = useState<SceneView | null>(null),
    [unavailable, setUnavailable] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    let controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.channel !== channel ||
        event.data?.type !== "scene-preview"
      )
        return;
      const turn = ++sequence.current;
      controller?.abort();
      clearTimeout(timer);
      const parsed = shoppableSceneSchema.safeParse(event.data.scene);
      if (!parsed.success) {
        setUnavailable(true);
        return;
      }
      timer = setTimeout(async () => {
        controller = new AbortController();
        const request = controller;
        try {
          const response = await fetch("/api/admin/scenes/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scopeMarketId,
              marketId,
              locale,
              scene: parsed.data,
            }),
            cache: "no-store",
            signal: request.signal,
          });
          if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
          const data = (await response.json()) as { view: SceneView };
          if (!request.signal.aborted && sequence.current === turn) {
            setView(data.view);
            setUnavailable(false);
          }
        } catch {
          if (!request.signal.aborted && sequence.current === turn)
            setUnavailable(true);
        }
      }, 200);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { type: "scene-preview-ready", channel },
      location.origin,
    );
    return () => {
      sequence.current++;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [channel, scopeMarketId, marketId, locale]);
  return (
    <main
      dir={locale === "fa" ? "rtl" : "ltr"}
      lang={locale}
      data-testid="authorized-scene-preview"
    >
      <p className="p-3">{t("previewOnly")}</p>
      {unavailable && (
        <p role="alert" className="scene-review">
          {t("previewUnavailable")}
        </p>
      )}
      {view ? (
        <ShoppableScene
          view={view}
          locale={locale}
          preview
          first
          frame={frame}
        />
      ) : (
        <p className="p-3">{t("previewWaiting")}</p>
      )}
    </main>
  );
}
