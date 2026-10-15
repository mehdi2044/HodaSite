"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { decodedSceneProofs } from "@/components/admin/scene-preview-proof";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
export function PrivateHomepageFrame({
  channel,
  sequence,
  children,
  locale,
}: {
  channel: string;
  sequence: number;
  children: ReactNode;
  locale: "fa" | "tr" | "en";
}) {
  const router = useRouter(),
    t = useTranslations("scenes"),
    [pending, refresh] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const expected = useRef(sequence),
    busy = useRef(pending);
  const [rendered, setRendered] = useState({ sequence, children, locale });
  useEffect(() => {
    if (sequence >= expected.current) {
      expected.current = sequence;
      setRendered({ sequence, children, locale });
    }
  }, [sequence, children, locale]);
  useEffect(() => {
    let cancelled = false,
      turn = 0;
    const update = async () => {
      const current = ++turn;
      if (!root.current) return;
      const result = await decodedSceneProofs(root.current);
      if (!cancelled && current === turn)
        window.parent.postMessage(
          {
            type: "homepage-preview-proofs",
            channel,
            sequence: rendered.sequence,
            ...result,
          },
          location.origin,
        );
    };
    void update();
    const observer = new MutationObserver(() => {
      void update();
    });
    if (root.current)
      observer.observe(root.current, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "hidden",
          "data-scene-confirmation",
          "data-scene-confirmation-key",
        ],
      });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [rendered, channel]);
  useEffect(() => {
    busy.current = pending;
  }, [pending]);
  useEffect(() => {
    document.documentElement.lang = rendered.locale;
    document.documentElement.dir = rendered.locale === "fa" ? "rtl" : "ltr";
  }, [rendered.locale]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden && !busy.current) refresh(() => router.refresh());
    };
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.channel !== channel ||
        event.data?.type !== "homepage-preview-refresh" ||
        !Number.isSafeInteger(event.data.sequence) ||
        event.data.sequence < expected.current
      )
        return;
      expected.current = event.data.sequence;
      refresh(() => router.refresh());
    };
    window.addEventListener("message", receive);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const timer = setInterval(update, 4000);
    window.parent.postMessage(
      { type: "homepage-preview-ready", channel },
      location.origin,
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [channel, router]);
  return (
    <div
      ref={root}
      data-testid="private-homepage-preview"
      data-preview-sequence={rendered.sequence}
      lang={rendered.locale}
      dir={rendered.locale === "fa" ? "rtl" : "ltr"}
    >
      <p className="p-3">{t("previewOnly")}</p>
      <div
        onClickCapture={(event) => {
          const anchor = (event.target as Element).closest<HTMLAnchorElement>(
            "a[href]",
          );
          if (!anchor || anchor.getAttribute("href")?.startsWith("#")) return;
          event.preventDefault();
          window.open(anchor.href, "_blank", "noopener,noreferrer");
        }}
        onSubmitCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {rendered.children}
      </div>
    </div>
  );
}
