"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
export function ModaBands({
  first,
  second,
  seconds,
  speed,
}: {
  first: string[];
  second: string[];
  seconds: number;
  speed?: { first: number; second: number };
}) {
  const t = useTranslations("modaHomepage"),
    root = useRef<HTMLElement>(null);
  const firstSpeed = speed?.first,
    secondSpeed = speed?.second;
  const [paused, pause] = useState(false),
    [visible, setVisible] = useState(false),
    [hidden, setHidden] = useState(true),
    [focus, setFocus] = useState(false);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries.some((entry) => entry.isIntersecting)),
    );
    // Only measure on layout changes. CSS owns every animation frame.
    const measure = () => {
      root.current
        ?.querySelectorAll<HTMLElement>(".moda-band-track")
        .forEach((track, row) => {
          const unit = track.firstElementChild as HTMLElement | null;
          if (unit)
            track.style.setProperty(
              "--ribbon-duration",
              firstSpeed && secondSpeed
                ? `${unit.offsetWidth / (row === 0 ? firstSpeed : secondSpeed)}s`
                : `${seconds}s`,
            );
        });
    };
    const resize = new ResizeObserver(measure);
    root.current
      ?.querySelectorAll(".moda-band-unit")
      .forEach((unit) => resize.observe(unit));
    measure();
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [seconds, firstSpeed, secondSpeed]);
  return (
    <section
      ref={root}
      className="moda-crossing-bands"
      data-moda4="bands"
      data-paused={paused || !visible || hidden || focus}
      onMouseEnter={() => setFocus(true)}
      onMouseLeave={() =>
        setFocus(Boolean(root.current?.contains(document.activeElement)))
      }
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      style={{ "--band-duration": `${seconds}s` } as React.CSSProperties}
    >
      <div className="moda-ribbons">
        {[first, second].map((words, row) => (
          <div key={row} className="moda-band" data-moda4="band">
            <div className="moda-band-track">
              {[0, 1].map((copy) => (
                <div
                  className="moda-band-unit"
                  key={copy}
                  aria-hidden={copy === 1 || undefined}
                >
                  {[...words, ...words].map((word, index) => (
                    <span
                      key={index}
                      aria-hidden={index >= words.length || undefined}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button button-outline"
        aria-pressed={paused}
        disabled={hidden}
        aria-label={paused ? t("resume") : t("pause")}
        title={paused ? t("resume") : t("pause")}
        onClick={() => pause((old) => !old)}
      >
        {paused ? t("resumeShort") : t("pauseShort")}
      </button>
    </section>
  );
}
