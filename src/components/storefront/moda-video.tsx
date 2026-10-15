"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
type ModaVideoProps = {
  url: string;
  sceneId?: string;
  poster?: string;
  fallback: ReactNode;
  autoplay: boolean;
};
export function ModaVideo(props: ModaVideoProps) {
  // A new source has its own readiness/error state; a failed old source must
  // neither hide its replacement nor receive a late event for that player.
  return <ModaVideoPlayer key={props.url} {...props} />;
}
function ModaVideoPlayer({
  url,
  fallback,
  autoplay,
  sceneId,
  poster,
}: ModaVideoProps) {
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
    // A fast/cached network failure can precede hydration. React does not
    // replay media errors, so reconcile the existing native state on mount.
    const player = video.current;
    if (player?.error) {
      setFailed(true);
      setReady(false);
    } else if (player && player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA)
      setReady(true);
  }, []);
  return (
    <div ref={root} className="moda-video-banner" data-ready={ready && !failed}>
      <div className="moda-video-poster">{fallback}</div>
      {!failed && (
        <video
          ref={video}
          data-scene-video-proof={sceneId}
          src={url}
          poster={poster}
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
