"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { resolveInstantSelection } from "@/modules/fitting/instant";
type FittingLayer = Awaited<
  ReturnType<typeof resolveInstantSelection>
>["layers"][number];
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import { SceneLayerImage } from "./scene-layer";

type Dress = { layer: FittingLayer; phase: "enter" | "steady" | "exit" };
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
function subscribeVisibility(change: () => void) {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}
const reduceSnapshot = () => window.matchMedia(motionQuery).matches;
const hiddenSnapshot = () => document.hidden;
const serverSnapshot = () => false;
const clampYaw = (value: number) => Math.max(-55, Math.min(55, value));

/** Presentation only: real, validated layers keep their original 420×560 frame. */
export function InstantFittingStage({
  model,
  layers,
  frameMediaId,
  locale,
  canClear,
  animateRemovals,
  onClear,
}: {
  model?: {
    id: string;
    kind: string;
    label: Record<string, string>;
    media: ResponsiveImageMedia;
  };
  layers: FittingLayer[];
  frameMediaId: string;
  locale: "fa" | "tr" | "en";
  canClear: boolean;
  animateRemovals: boolean;
  onClear: () => void;
}) {
  const t = useTranslations("instantFitting");
  const reduced = useSyncExternalStore(
    subscribeMotion,
    reduceSnapshot,
    serverSnapshot,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    hiddenSnapshot,
    serverSnapshot,
  );
  const [yaw, setYaw] = useState(-14);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; yaw: number; pointer: number } | null>(null);
  const [dresses, setDresses] = useState<Dress[]>(() =>
    layers.map((layer) => ({ layer, phase: "enter" })),
  );
  useLayoutEffect(() => {
    setDresses((old) => {
      const current = layers.map((layer) => {
        const prior = old.find(
          (row) =>
            row.layer.variantId === layer.variantId && row.phase !== "exit",
        );
        return {
          layer,
          phase: reduced
            ? ("steady" as const)
            : (prior?.phase ?? ("enter" as const)),
        };
      });
      // Revalidation failure/model change drops stale media immediately. Only a
      // valid user removal may finish the reference's short exit animation.
      if (!reduced && animateRemovals && model) {
        for (const row of old) {
          if (
            !layers.some((layer) => layer.variantId === row.layer.variantId)
          ) {
            current.push({ layer: row.layer, phase: "exit" });
          }
        }
      }
      return current;
    });
  }, [layers, reduced, animateRemovals, model]);
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  return (
    <>
      <div
        data-moda4="tryon-stage"
        data-dragging={dragging}
        data-paused={hidden}
        data-stage-model-kind={model?.kind}
        data-reduced-motion={reduced}
        className="moda-instant-stage moda-fr-stage"
        tabIndex={0}
        role="group"
        aria-label={
          !model
            ? t("noModels")
            : reduced
              ? t("motionReduced")
              : t("rotateHelp")
        }
        onKeyDown={(event) => {
          if (
            !model ||
            reduced ||
            !["ArrowLeft", "ArrowRight", "Home"].includes(event.key)
          )
            return;
          event.preventDefault();
          setYaw((value) =>
            event.key === "Home"
              ? 0
              : clampYaw(value + (event.key === "ArrowLeft" ? -5 : 5)),
          );
        }}
        onPointerDown={(event) => {
          if (
            !model ||
            reduced ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          drag.current = { x: event.clientX, yaw, pointer: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointer !== event.pointerId) return;
          setYaw(
            clampYaw(
              drag.current.yaw + (event.clientX - drag.current.x) * 0.35,
            ),
          );
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onBlur={endDrag}
      >
        <span className="moda-fr-drag-hint">
          {!model
            ? t("noModels")
            : reduced
              ? t("motionReduced")
              : t("dragHint")}
        </span>
        <div
          data-moda4="tryon-turntable"
          data-yaw={yaw}
          className="moda-instant-turn moda-fr-turn"
          style={{
            transform: `rotateY(${yaw}deg) scale(var(--moda-model-scale,1))`,
          }}
        >
          <div className="moda-fr-surface">
            {model && (
              <div
                className="moda-instant-mannequin"
                data-moda4="tryon-mannequin"
              >
                <ResponsiveImage
                  media={{
                    ...model.media,
                    altI18n: model.label,
                    presentation: { fit: "contain" },
                  }}
                  locale={locale}
                  role="catalog"
                  sizes="420px"
                  className="block h-full w-full"
                  imgClassName="h-full w-full object-contain"
                />
              </div>
            )}
            {model &&
              dresses.map(({ layer, phase }) => (
                <div
                  key={layer.variantId}
                  className="moda-fr-dress"
                  data-motion={phase}
                  aria-hidden="true"
                  style={{
                    transform: `translateZ(${Math.max(-20, Math.min(45, layer.geometry.zIndex * 9))}px)`,
                    zIndex: layer.geometry.zIndex + 21,
                  }}
                  onAnimationEnd={(event) => {
                    const finished =
                      event.animationName === "moda-fr-dress-out"
                        ? "exit"
                        : event.animationName === "moda-fr-dress-in"
                          ? "enter"
                          : null;
                    if (!finished) return;
                    setDresses((old) =>
                      old.flatMap((row) =>
                        row.layer.variantId !== layer.variantId ||
                        row.phase !== finished
                          ? [row]
                          : finished === "exit"
                            ? []
                            : [{ ...row, phase: "steady" }],
                      ),
                    );
                  }}
                >
                  <SceneLayerImage
                    instant
                    pieceId={layer.variantId}
                    layer={layer}
                    model={model.media}
                    locale={locale}
                    frame={{
                      mediaId: frameMediaId,
                      fit: "contain",
                      aspect: "3:4",
                      focal: { x: 0.5, y: 0.5 },
                    }}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>
      <div
        className="moda-fr-rotation"
        role="group"
        aria-label={t("rotationControls")}
      >
        <button
          type="button"
          aria-label={t("rotateLeft")}
          disabled={!model || reduced}
          onClick={() => setYaw((value) => clampYaw(value - 25))}
        >
          <span className="moda-fr-icon moda-fr-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("rotateRight")}
          disabled={!model || reduced}
          onClick={() => setYaw((value) => clampYaw(value + 25))}
        >
          <span className="moda-fr-icon moda-fr-right" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!model || reduced}
          onClick={() => setYaw(0)}
        >
          {t("front")}
        </button>
        <button type="button" disabled={!canClear} onClick={onClear}>
          {t("clearSelection")}
        </button>
      </div>
    </>
  );
}
