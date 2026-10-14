"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ModaVideo({
  url,
  fallback,
  autoplay,
  sceneId,
}: {
  url: string;
  sceneId?: string;
  fallback: ReactNode;
  autoplay: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false,
      engaged = false;
    const update = () => {
      if (
        document.hidden ||
        !visible ||
        media.matches ||
        engaged ||
        !autoplay ||
        failed
      )
        player.pause();
      else void player.play().catch(() => {});
    };
    const enter = () => {
        engaged = true;
        update();
      },
      leave = () => {
        engaged = false;
        update();
      };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    root.current?.addEventListener("mouseenter", enter);
    root.current?.addEventListener("mouseleave", leave);
    root.current?.addEventListener("focusin", enter);
    root.current?.addEventListener("focusout", leave);
    const element = root.current;
    return () => {
      player.pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
      element?.removeEventListener("mouseenter", enter);
      element?.removeEventListener("mouseleave", leave);
      element?.removeEventListener("focusin", enter);
      element?.removeEventListener("focusout", leave);
    };
  }, [url, autoplay, failed]);
  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [url]);
  return (
    <div ref={root} className="moda-video-banner" data-ready={ready && !failed}>
      <div className="moda-video-poster">{fallback}</div>
      {!failed && (
        <video
          ref={video}
          data-scene-video-proof={sceneId}
          src={url}
          preload="metadata"
          controls
          playsInline
          muted={autoplay}
          onCanPlay={() => setReady(true)}
          onError={() => {
            setFailed(true);
            setReady(false);
          }}
          className="moda-video-player"
        />
      )}
    </div>
  );
}
