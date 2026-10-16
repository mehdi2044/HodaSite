"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
export function ModaBands({
  first,
  second,
  seconds,
}: {
  first: string[];
  second: string[];
  seconds: number;
}) {
  const t = useTranslations("modaHomepage"),
    root = useRef<HTMLElement>(null);
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
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
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
      {[first, second].map((words, row) => (
        <div key={row} className="moda-band" data-moda4="band">
          <div>
            {words.map((word, index) => (
              <span key={index}>{word}</span>
            ))}
            <span aria-hidden="true">{words.join(" · ")}</span>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="button button-outline"
        aria-pressed={paused}
        onClick={() => pause((old) => !old)}
      >
        {paused ? t("resume") : t("pause")}
      </button>
    </section>
  );
}
