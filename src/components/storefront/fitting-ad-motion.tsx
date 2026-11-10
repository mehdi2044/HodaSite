"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import "@/styles/moda-fitting-ad.css";
import { ResponsiveImage } from "./responsive-image";
import type {
  FittingAdLook,
  FittingAdPiece,
  FittingSlot,
} from "@/modules/content/scenes/fitting-ad";
import {
  FITTING_FLIGHT_MS,
  fittingDeparture,
  fittingPhase,
  fittingTiming,
} from "./fitting-ad-timeline";

type Locale = "fa" | "tr" | "en";
const rackWidths: Record<FittingSlot, number> = {
  TOP: 118,
  BOTTOM: 70,
  LAYER: 84,
  ACCESSORY: 90,
  ONE_PIECE: 110,
  SHOES: 70,
};
const layerDepth: Record<FittingSlot, number> = {
  BOTTOM: 5,
  SHOES: 5,
  ONE_PIECE: 6,
  TOP: 6,
  LAYER: 7,
  ACCESSORY: 8,
};
const phaseKeys = {
  pick: "fittingPick",
  dress: "fittingDress",
  style: "fittingStyle",
  look: "fittingYourLook",
} as const;
const ease = "cubic-bezier(.45,.05,.2,1)";
const styleOf = (piece: FittingAdPiece): CSSProperties => ({
  clipPath: piece.clip,
  left: piece.target.x * 100 + "%",
  top: piece.target.y * 100 + "%",
  width: piece.target.width * 100 + "%",
  height: piece.target.height * 100 + "%",
  zIndex:
    layerDepth[piece.slot] * 10 + Math.max(0, Math.min(9, piece.target.zIndex)),
  transform: "translate(-50%, -50%) rotate(" + piece.target.rotation + "deg)",
});
function Hanger() {
  return (
    <svg
      className="m4-hanger"
      viewBox="0 0 64 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M32 14a5 5 0 1 1 5-5c0 3-5 4-5 8L5 36h54L32 17" />
    </svg>
  );
}

function Stage({
  look,
  all,
  locale,
  compact,
  still,
  paused,
  complete,
}: {
  look: FittingAdLook;
  all: FittingAdLook[];
  locale: Locale;
  compact: boolean;
  still: boolean;
  paused: boolean;
  complete: () => void;
}) {
  const t = useTranslations("modaHomepage");
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rack = useRef(new Map<string, HTMLDivElement>());
  const rail = useRef<HTMLDivElement>(null);
  const flights = useRef(new Map<string, HTMLDivElement>());
  const layers = useRef(new Map<string, HTMLDivElement>());
  const model = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);
  const reveal = useRef<HTMLDivElement>(null);
  const ready = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const syncClock = useRef<() => void>(() => {});
  const playing = useRef(!paused);
  const onComplete = useRef(complete);
  const [currentStep, setStep] = useState(fittingPhase(0, look.pieces.length));
  const width = compact ? 720 : 1100;
  const railWidth = compact ? 296 : 560;
  const garments = [
    ...new Map(
      (compact ? [look] : all)
        .flatMap((l) => [...l.pieces].sort((a, b) => a.rackOrder - b.rackOrder))
        .map((p) => [p.rackKey, p]),
    ).values(),
  ];
  const shownStep = still
    ? fittingPhase(fittingTiming(look.pieces.length).end, look.pieces.length)
    : currentStep;

  useEffect(() => {
    playing.current = !paused;
    onComplete.current = complete;
    syncClock.current();
  }, [paused, complete]);

  useLayoutEffect(() => {
    const outer = box.current,
      scene = stage.current;
    if (!outer || !scene) return;
    const timing = fittingTiming(look.pieces.length);
    let animations: Animation[] = [],
      previous = 0,
      frame = 0,
      observedWidth = -1,
      visible = false;
    let readyToPlay = false,
      decoded = false,
      disposed = false;
    const shouldRun = () =>
      !still &&
      readyToPlay &&
      decoded &&
      playing.current &&
      visible &&
      !document.hidden &&
      elapsed.current < timing.end;
    let lastStep = "";
    const paint = (time: number) => {
      for (const animation of animations) animation.currentTime = time;
      const next = fittingPhase(time, look.pieces.length);
      const key = next.phase + next.number;
      if (key !== lastStep) {
        lastStep = key;
        setStep(next);
      }
      scene.style.setProperty("--m4-time", String(Math.round(time)));
    };
    const tick = (timestamp: number) => {
      frame = 0;
      if (!shouldRun()) return sync();
      elapsed.current = Math.min(
        timing.end,
        elapsed.current + (previous ? timestamp - previous : 0),
      );
      previous = timestamp;
      paint(elapsed.current);
      if (elapsed.current === timing.end) {
        sync();
        onComplete.current();
      } else frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      const running = shouldRun();
      scene.dataset.running = String(running);
      if (!running) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      } else if (!frame) frame = requestAnimationFrame(tick);
    };
    syncClock.current = sync;
    const animate = (
      node: Element | null,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      if (!node) return;
      const animation = node.animate(frames, { fill: "both", ...options });
      animation.pause();
      animations.push(animation);
    };
    const cancelAnimations = () => {
      for (const animation of animations) animation.cancel();
      animations = [];
    };
    const build = () => {
      const w = outer.clientWidth;
      if (!w || w === observedWidth) return;
      observedWidth = w;
      const scale = w / width;
      outer.style.setProperty("--m4-scale", String(scale));
      cancelAnimations();
      if (still) return;
      const base = scene.getBoundingClientRect();
      const toScene = (node: Element) => {
        const r = node.getBoundingClientRect();
        return {
          x: (r.left + r.width / 2 - base.left) / scale,
          y: (r.top + r.height / 2 - base.top) / scale,
          w: r.width / scale,
        };
      };
      // Measure the undisturbed rail first; neither animation nor resize can
      // move the stored origins until the entire new frame is ready.
      const origins = new Map<string, ReturnType<typeof toScene>>();
      rack.current.forEach((node, id) => {
        const image = node.querySelector(".m4-rack-image");
        if (image) origins.set(id, toScene(image));
      });
      rack.current.forEach((node, id) => {
        const index = [...origins.keys()].indexOf(id);
        animate(
          node,
          [
            { transform: "rotateY(-26deg) rotateZ(-.8deg)" },
            { transform: "rotateY(-20deg) rotateZ(.8deg)" },
            { transform: "rotateY(-26deg) rotateZ(-.8deg)" },
          ],
          {
            duration: 4000,
            iterations: Infinity,
            delay: -index * 420,
            easing: "ease-in-out",
          },
        );
      });
      look.pieces.forEach((piece, i) => {
        const source = rack.current.get(piece.rackKey);
        const from = origins.get(piece.rackKey);
        const flight = flights.current.get(piece.id);
        const target = layers.current.get(piece.id);
        if (!source || !from || !from.w || !flight || !target) return;
        const x = (compact ? 300 : 660) + piece.target.x * 420;
        const y = 40 + piece.target.y * 560;
        const mediaRatio = (piece.media.width ?? 1) / (piece.media.height ?? 1);
        const toWidth = Math.min(
          piece.target.width * 420,
          piece.target.height * 560 * mediaRatio,
        );
        const k = toWidth / from.w;
        Object.assign(flight.style, {
          left: from.x + "px",
          top: from.y + "px",
          width: from.w + "px",
          height: from.w / mediaRatio + "px",
        });
        const dx = x - from.x,
          dy = y - from.y;
        const start = fittingDeparture(i),
          land = start + FITTING_FLIGHT_MS;
        const translate = (a: number, b: number, transform: string) =>
          "translate(-50%, -50%) translate(" +
          a +
          "px," +
          b +
          "px) " +
          transform;
        const finish = translate(
          dx,
          dy,
          "rotateY(360deg) rotateZ(" +
            piece.target.rotation +
            "deg) scale(" +
            k +
            ")",
        );
        animate(
          flight,
          [
            { opacity: 0, transform: translate(0, 0, "rotateY(-24deg)") },
            {
              opacity: 1,
              transform: translate(0, -2, "rotateY(-23deg)"),
              offset: 0.025,
            },
            {
              opacity: 1,
              transform: translate(0, -70, "rotateY(0deg) scale(1.08)"),
              offset: 0.22,
            },
            {
              opacity: 1,
              transform: translate(
                dx * 0.55,
                dy - (compact ? 115 : 160),
                "rotateY(200deg) rotateZ(-6deg) scale(" + (1 + k) / 2 + ")",
              ),
              offset: 0.62,
            },
            { opacity: 1, transform: finish, offset: 0.97 },
            { opacity: 0, transform: finish },
          ],
          { delay: start, duration: FITTING_FLIGHT_MS, easing: ease },
        );
        animate(
          source.querySelector(".m4-rack-image"),
          [{ opacity: 1 }, { opacity: 0 }],
          { delay: start, duration: 45 },
        );
        animate(
          source.querySelector(".m4-hanger"),
          [{ opacity: 1 }, { opacity: 0 }],
          { delay: start + 500, duration: 500 },
        );
        animate(target, [{ opacity: 0 }, { opacity: 1 }], {
          delay: land - 30,
          duration: 30,
        });
        if (look.photo)
          animate(target, [{ opacity: 1 }, { opacity: 0 }], {
            delay: timing.reveal,
            duration: 500,
            fill: "forwards",
          });
      });
      // The compact scene has no spare clothes. Fade its rail with the last
      // departing hanger instead of displaying a bare rack in the result.
      if (origins.size === look.pieces.length) {
        animate(rail.current, [{ opacity: 1 }, { opacity: 0 }], {
          delay: fittingDeparture(look.pieces.length - 1),
          duration: 540,
        });
      }
      animate(
        scan.current,
        [
          { opacity: 0, top: "30px" },
          { opacity: 1, top: "65px", offset: 0.08 },
          { opacity: 1, top: "435px", offset: 0.92 },
          { opacity: 0, top: "470px" },
        ],
        { delay: timing.scan, duration: 1200, easing: "ease-in-out" },
      );
      if (look.photo) {
        animate(model.current, [{ opacity: 1 }, { opacity: 0 }], {
          delay: timing.reveal,
          duration: 600,
        });
        animate(
          reveal.current,
          [
            { opacity: 0, transform: "scale(.92)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { delay: timing.reveal, duration: 900, easing: "ease-out" },
        );
      }
      animate(ready.current, [{ opacity: 0 }, { opacity: 1 }], {
        delay: timing.reveal + 400,
        duration: 600,
      });
      paint(elapsed.current);
      readyToPlay = origins.size > 0;
      sync();
    };
    build();
    Promise.allSettled(
      [...scene.querySelectorAll("img")].map((image) => image.decode()),
    ).then(() => {
      if (disposed) return;
      decoded = true;
      sync();
    });
    const resize = new ResizeObserver(build);
    resize.observe(outer);
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(
          entry?.isIntersecting && entry.intersectionRatio >= 0.35,
        );
        sync();
      },
      { threshold: 0.35 },
    );
    intersection.observe(outer);
    document.addEventListener("visibilitychange", sync);
    return () => {
      disposed = true;
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      cancelAnimationFrame(frame);
      cancelAnimations();
      syncClock.current = () => {};
    };
  }, [compact, look, still, width]);

  return (
    <div
      className="m4-scene-box"
      ref={box}
      data-scene={compact ? "compact" : "wide"}
      data-still={still}
      data-photo={Boolean(look.photo)}
    >
      <div
        className="m4-scene"
        ref={stage}
        data-m4-stage=""
        data-step={shownStep.phase}
        aria-hidden="true"
      >
        <div className="m4-step" data-m4-step="">
          {String(shownStep.number).padStart(2, "0")} —{" "}
          {t(phaseKeys[shownStep.phase])}
        </div>
        <div className="m4-floor" />
        {!still && (
          <div className="m4-rack" data-moda4="fitting-ad-rack" ref={rail}>
            <span className="m4-leg a" />
            <span className="m4-leg b" />
            <span className="m4-base a" />
            <span className="m4-base b" />
            <span className="m4-rail" />
            {garments.map((piece, i) => {
              const garmentWidth = rackWidths[piece.slot];
              const inset = compact ? 36 : 58;
              const center =
                inset +
                (i * (railWidth - 2 * inset)) /
                  Math.max(1, garments.length - 1);
              return (
                <div
                  className="m4-garment"
                  data-m4-rack-piece={piece.slot}
                  key={piece.rackKey}
                  ref={(node) => {
                    if (node) rack.current.set(piece.rackKey, node);
                    else rack.current.delete(piece.rackKey);
                  }}
                  style={{
                    left: center - garmentWidth / 2,
                    width: garmentWidth,
                  }}
                >
                  <Hanger />
                  <div className="m4-rack-image">
                    <ResponsiveImage
                      media={piece.media}
                      locale={locale}
                      sizes="140px"
                      priority
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="m4-model" ref={model} data-moda4="fitting-ad-mannequin">
          <ResponsiveImage
            media={look.model}
            locale={locale}
            sizes="420px"
            priority
          />
        </div>
        <div className="m4-dressed">
          {look.pieces.map((piece) => (
            <div
              className="m4-layer"
              data-m4-layer={piece.slot}
              key={piece.id}
              style={styleOf(piece)}
              ref={(node) => {
                if (node) layers.current.set(piece.id, node);
                else layers.current.delete(piece.id);
              }}
            >
              <ResponsiveImage
                media={piece.media}
                locale={locale}
                sizes="220px"
                priority
              />
            </div>
          ))}
        </div>
        {!still &&
          look.pieces.map((piece) => (
            <div
              className="m4-fly"
              data-m4-flight={piece.slot}
              key={piece.id}
              ref={(node) => {
                if (node) flights.current.set(piece.id, node);
                else flights.current.delete(piece.id);
              }}
              style={{
                zIndex:
                  layerDepth[piece.slot] * 10 +
                  Math.max(0, Math.min(9, piece.target.zIndex)),
              }}
            >
              <ResponsiveImage
                media={piece.media}
                locale={locale}
                sizes="220px"
                priority
              />
            </div>
          ))}
        {!still && <div className="m4-scan" ref={scan} />}
        {look.photo && (
          <div className="m4-reveal" ref={reveal}>
            <ResponsiveImage
              media={compact ? look.photo.mobile : look.photo.desktop}
              locale={locale}
              sizes="330px"
              priority
            />
          </div>
        )}
        <div className="m4-ready" ref={ready}>
          {t("fittingReady")}
        </div>
      </div>
    </div>
  );
}

export function FittingAdMotion({
  looks,
  locale,
  autoplay,
  motion,
  children,
  staticPhoto,
  cta,
}: {
  looks: FittingAdLook[];
  locale: Locale;
  autoplay: boolean;
  motion: boolean;
  children: ReactNode;
  staticPhoto: FittingAdLook["photo"];
  cta: ReactNode;
}) {
  const t = useTranslations("modaHomepage");
  const ad = useRef<HTMLDivElement>(null);
  const prefetched = useRef(new Set<string>());
  const [selection, setSelection] = useState(0);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(!autoplay);
  const [ended, setEnded] = useState(false);
  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);
  useLayoutEffect(() => {
    const narrow = matchMedia("(max-width: 760px)");
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setCompact(narrow.matches);
      setReduced(preference.matches);
    };
    update();
    narrow.addEventListener("change", update);
    preference.addEventListener("change", update);
    return () => {
      narrow.removeEventListener("change", update);
      preference.removeEventListener("change", update);
    };
  }, []);
  const active = looks[selection] ?? looks[0];
  const still = !motion || reduced;
  useEffect(() => {
    const element = ad.current;
    if (!element || still || !autoplay || looks.length < 2) return;
    const next = looks[(selection + 1) % looks.length];
    const observe = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      const photo = compact ? next.photo?.mobile : next.photo?.desktop;
      const files = [
        next.model.url,
        ...(photo ? [photo.url] : []),
        ...(compact ? next.pieces.map((piece) => piece.media.url) : []),
      ];
      for (const url of files) {
        if (prefetched.current.has(url)) continue;
        prefetched.current.add(url);
        const preload = new Image();
        preload.fetchPriority = "low";
        preload.src = url;
      }
      observe.disconnect();
    });
    observe.observe(element);
    return () => observe.disconnect();
  }, [autoplay, compact, looks, selection, still]);
  const select = (index: number, play = false) => {
    setSelection(index);
    setReplay((value) => value + 1);
    setEnded(false);
    if (play) setPaused(false);
  };
  return (
    <div
      className="m4-fit"
      ref={ad}
      data-moda4="fitting-ad"
      data-state={active ? "animated" : staticPhoto ? "static" : "copy-only"}
    >
      <div className="m4-fit-wrap">
        <div className="m4-fit-copy">
          {children}
          {active && (looks.length > 1 || !still) && (
            <div
              className="m4-fit-sets"
              role="group"
              aria-label={t("fittingSelect")}
            >
              {looks.map((look, index) => (
                <button
                  key={look.id}
                  type="button"
                  className="m4-chip"
                  aria-pressed={look.id === active.id}
                  data-m4-look={look.id}
                  onClick={() => select(index)}
                >
                  {look.label}
                </button>
              ))}
              {!still && (
                <>
                  <button
                    type="button"
                    className="m4-chip m4-motion-control"
                    data-m4-replay=""
                    onClick={() => select(selection, true)}
                  >
                    {t("replay")}
                  </button>
                  <button
                    type="button"
                    className="m4-chip m4-motion-control m4-pause"
                    data-m4-pause=""
                    aria-label={paused ? t("resume") : t("pause")}
                    aria-pressed={paused}
                    onClick={() =>
                      ended
                        ? select(selection, true)
                        : setPaused((value) => !value)
                    }
                  >
                    <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
                  </button>
                </>
              )}
            </div>
          )}
          {cta}
        </div>
        {active ? (
          <Stage
            key={active.id + ":" + replay}
            look={active}
            all={looks}
            locale={locale}
            compact={compact}
            still={still}
            paused={paused}
            complete={() =>
              autoplay
                ? select((selection + 1) % looks.length)
                : (setEnded(true), setPaused(true))
            }
          />
        ) : (
          staticPhoto && (
            <figure className="m4-static">
              <ResponsiveImage
                media={compact ? staticPhoto.mobile : staticPhoto.desktop}
                locale={locale}
                sizes="420px"
              />
              <figcaption>{t("stylingDemonstration")}</figcaption>
            </figure>
          )
        )}
      </div>
    </div>
  );
}
