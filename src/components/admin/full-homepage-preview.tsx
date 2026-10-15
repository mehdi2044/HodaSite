"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { HomepageBlock } from "@/modules/content/homepage";
import type { ScenePreviewProof } from "./scene-preview-proof";
/** Unsaved input is privately prepared, then rendered by the real Next RSC route. */
export function FullHomepagePreview({
  scopeMarketId,
  market,
  locale,
  blocks,
  width,
  onProofs,
}: {
  scopeMarketId: string | null;
  market: { id: string } | undefined;
  locale: "fa" | "tr" | "en";
  blocks: HomepageBlock[];
  width: number;
  onProofs: (visibleIds: string[], proofs: ScenePreviewProof[]) => void;
}) {
  const t = useTranslations("scenes"),
    frame = useRef<HTMLIFrameElement>(null),
    latest = useRef(0),
    ready = useRef(false),
    proofCallback = useRef(onProofs);
  proofCallback.current = onProofs;
  const [channel, setChannel] = useState(""),
    [source, setSource] = useState<string | undefined>(),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setChannel(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (!channel || !market) return;
    const sequence = ++latest.current,
      controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/homepage/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            scopeMarketId,
            marketId: market.id,
            locale,
            blocks,
            sequence,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
        const result = (await response.json()) as { sequence: number };
        if (controller.signal.aborted || latest.current !== sequence) return;
        setUnavailable(false);
        if (!ready.current)
          setSource(
            `/admin/preview/homepage?${new URLSearchParams({ channel, sequence: String(result.sequence) })}`,
          );
        else
          frame.current?.contentWindow?.postMessage(
            {
              type: "homepage-preview-refresh",
              channel,
              sequence: result.sequence,
            },
            location.origin,
          );
      } catch {
        if (!controller.signal.aborted && latest.current === sequence)
          setUnavailable(true);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [channel, market, locale, blocks, scopeMarketId]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      if (event.data?.type === "homepage-preview-ready") {
        ready.current = true;
        frame.current?.contentWindow?.postMessage(
          {
            type: "homepage-preview-refresh",
            channel,
            sequence: latest.current,
          },
          location.origin,
        );
      }
      if (
        event.data?.type === "homepage-preview-proofs" &&
        event.data.sequence === latest.current &&
        Array.isArray(event.data.visibleSceneIds) &&
        Array.isArray(event.data.proofs)
      )
        proofCallback.current(event.data.visibleSceneIds, event.data.proofs);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [channel]);
  return (
    <div className="min-w-0 grid gap-3">
      {unavailable && <p role="status">{t("previewUnavailable")}</p>}
      <div className="overflow-auto rounded-token border bg-surface p-2">
        <iframe
          ref={frame}
          data-testid="homepage-unsaved-preview"
          src={source}
          title={t("previewOnly")}
          onLoad={() => {
            frame.current?.contentWindow?.postMessage(
              {
                type: "homepage-preview-refresh",
                channel,
                sequence: latest.current,
              },
              location.origin,
            );
          }}
          style={{
            width,
            height: 760,
            border: 0,
            background: "var(--background)",
          }}
        />
      </div>
    </div>
  );
}
