import { heroMode, heroViolations, type Rect } from "./hero-layout";

/** Measure actual rendered content, shared by the operator matrix and browser tests. */
export function measureHeroSlide(slide: HTMLElement) {
  const win = slide.ownerDocument.defaultView!;
  const base = slide.getBoundingClientRect();
  const rect = (el: Element | null): Rect | null => {
    if (
      !el ||
      !el.getClientRects().length ||
      win.getComputedStyle(el).display === "none"
    )
      return null;
    const r = el.getBoundingClientRect();
    return {
      l: r.left - base.left,
      t: r.top - base.top,
      r: r.right - base.left,
      b: r.bottom - base.top,
    };
  };
  const copy = slide.querySelector<HTMLElement>("[data-moda4=hero-copy]")!;
  const title = slide.querySelector<HTMLElement>("[data-moda4=hero-title]")!;
  const strip = slide.querySelector<HTMLElement>("[data-moda4=hero-prices]");
  const header = slide.ownerDocument.querySelector("[data-moda4=header]");
  const style = win.getComputedStyle(title);
  const mode = heroMode(
    win.innerWidth,
    win.matchMedia("(orientation:portrait)").matches,
  );
  const bounds = rect(strip);
  return {
    mode,
    violations: heroViolations({
      mode,
      width: base.width,
      height: base.height,
      copy: rect(copy)!,
      subject: rect(slide.querySelector("[data-moda4=hero-subject]"))!,
      header: {
        l: 0,
        t: -9999,
        r: base.width,
        b: header ? header.getBoundingClientRect().bottom - base.top : 0,
      },
      controls: rect(
        slide
          .closest("[data-moda4=hero]")
          ?.querySelector(".moda-carousel-controls") ?? null,
      ),
      title: {
        clipped: title.scrollWidth > title.clientWidth + 1,
        fontSize: parseFloat(style.fontSize),
        weight: style.fontWeight,
      },
      pins: [
        ...slide.querySelectorAll<HTMLElement>("[data-moda4=hero-pin]"),
      ].map((pin) => ({
        dot: pin.hidden ? null : rect(pin.querySelector(".m4-dot")),
        label: pin.hidden ? null : rect(pin.querySelector(".m4-tag")),
      })),
      float: rect(slide.querySelector("[data-moda4=hero-float]:not([hidden])")),
      strip: {
        visible: !!bounds,
        items: strip?.querySelectorAll("li").length ?? 0,
        clipped:
          !!bounds &&
          (bounds.l < 0 ||
            bounds.r > base.width ||
            bounds.t < 0 ||
            bounds.b > base.height ||
            strip!.scrollWidth > strip!.clientWidth + 1 ||
            [...strip!.querySelectorAll("li")].some((li) => {
              const b = rect(li)!;
              return b.l < bounds.l - 1 || b.r > bounds.r + 1;
            })),
      },
      ctas: [...copy.querySelectorAll("[data-moda4-cta]")].flatMap((el) =>
        rect(el) ? [rect(el)!] : [],
      ),
    }),
  };
}
