/**
 * MODA4 visual-fidelity gate.
 *
 * Measures the storefront against the owner-approved MODA4 prototype
 * (docs/design/moda4-redesign/prototype/MODA4-Redesign-v3.html) through
 * stable `data-moda4` hooks and computed styles, not pixel equality: real
 * catalog data differs from the demo copy, but layout, typography, 3D and
 * section composition must not.
 *
 *   MODA4_FIDELITY_TARGET=prototype  → self-test against the prototype (must be all green)
 *   MODA4_FIDELITY_TARGET=app        → the running Next.js app (default)
 *
 * The full contract (every hook and value) is FIDELITY_SPEC.md beside the prototype.
 * Output: test-results/moda4-fidelity/<target>/ (report.md, results.json, screenshots)
 * and, when both targets have run, side-by-side images in test-results/moda4-fidelity/compare/.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const TARGET =
  process.env.MODA4_FIDELITY_TARGET === "prototype" ? "prototype" : "app";
const ROOT = process.cwd();
const PROTO =
  "file://" +
  path.join(
    ROOT,
    "docs/design/moda4-redesign/prototype/MODA4-Redesign-v3.html",
  );
const APP = process.env.MODA4_APP_URL ?? "http://127.0.0.1:3000";
const enc = encodeURIComponent;

/** Page → [prototype hash, app path]. App paths use seeded demo data; override with env when slugs differ. */
const PAGES: Record<string, [string, string]> = {
  home: ["#home", process.env.MODA4_HOME_PATH ?? "/fa"],
  women: ["#shop-w", process.env.MODA4_WOMEN_PATH ?? "/fa/c/" + enc("زنانه")],
  kids: ["#shop-k", process.env.MODA4_KIDS_PATH ?? "/fa/c/" + enc("کودک")],
  product: [
    "#product-women-dress",
    process.env.MODA4_PDP_PATH ?? "/fa/p/" + enc("نمونه-women-dress-moda4"),
  ],
  fitting: ["#fitting", process.env.MODA4_FITTING_PATH ?? "/fa/fitting-room"],
  account: ["#account", process.env.MODA4_ACCOUNT_PATH ?? "/fa/account/login"],
};
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const OUT = path.join(ROOT, "test-results/moda4-fidelity", TARGET);

/**
 * Typography roles from the owner-approved D77 amendment of D26: Manrope for Latin display
 * headings (kids included), Inter for Latin UI/body/prices, Vazirmatn for Persian.
 * Change these only together with the ADR.
 */
const DISPLAY_FONT = "Manrope";
type Result = {
  page: string;
  viewport: string;
  id: string;
  rule: string;
  pass: boolean;
  detail: string;
};
const results: Result[] = [];

function url(page: string) {
  const [hash, appPath] = PAGES[page];
  return TARGET === "prototype" ? PROTO + hash : APP + appPath;
}

async function open(page: Page, name: string) {
  await page.goto(url(name), { waitUntil: "load" });
  await page.waitForTimeout(TARGET === "prototype" ? 1900 : 1200); // prototype logo loader ≤1.5 s
  // Trigger scroll-reveal / lazy media, then return to top.
  await page.evaluate(async () => {
    for (let y = 0; y < Math.min(document.body.scrollHeight, 12000); y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
}

/** Runs one rule inside the page; the function returns [pass, detail]. */
async function rule(
  page: Page,
  ctx: { page: string; viewport: string },
  id: string,
  text: string,
  fn: (vw: number) => [boolean, string],
) {
  let pass = false;
  let detail = "";
  try {
    [pass, detail] = await page.evaluate(fn, page.viewportSize()!.width);
  } catch (e) {
    detail = "evaluation error: " + String(e).slice(0, 160);
  }
  results.push({ ...ctx, id, rule: text, pass, detail });
}

// ---------- shared in-page helpers (serialised into each rule) ----------
// Each rule body is self-contained because page.evaluate cannot close over Node scope.

for (const vp of VIEWPORTS) {
  test.describe(`MODA4 fidelity · ${vp.name}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });

    for (const name of Object.keys(PAGES)) {
      test(`${name}`, async ({ page }) => {
        const ctx = { page: name, viewport: vp.name };
        const desktop = vp.name === "desktop";
        await open(page, name);
        // In-page rules cannot see Node scope; expose the approved display font on <html>.
        await page.evaluate((f) => {
          document.documentElement.dataset.moda4TestFont = f;
        }, DISPLAY_FONT);
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({
          path: path.join(OUT, `${name}-${vp.width}.png`),
          fullPage: true,
        });

        // ---------- global ----------
        await rule(
          page,
          ctx,
          "G1",
          "header [data-moda4=header] exists" +
            (desktop ? ", height 64–84px" : ""),
          (vw) => {
            const h = document.querySelector<HTMLElement>(
              "[data-moda4=header]",
            );
            if (!h) return [false, "missing"];
            const r = h.getBoundingClientRect();
            return [
              vw < 760 || (r.height >= 64 && r.height <= 84),
              `height ${Math.round(r.height)}px`,
            ];
          },
        );
        await rule(
          page,
          ctx,
          "G2",
          "logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset)" +
            (desktop ? ", centred in header (±4%)" : ""),
          (vw) => {
            const l = document.querySelector<HTMLElement>("[data-moda4=logo]");
            if (!l) return [false, "missing"];
            const mark = l.querySelector("svg, img");
            if (!mark) return [false, "no logo svg/img inside the hook"];
            const r = l.getBoundingClientRect();
            const off = Math.abs(r.left + r.width / 2 - vw / 2) / vw;
            return [
              vw < 760 || off <= 0.04,
              `centre offset ${(off * 100).toFixed(1)}%`,
            ];
          },
        );
        await rule(
          page,
          ctx,
          "G3",
          "footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop)",
          (vw) => {
            const f = document.querySelector("[data-moda4=footer]");
            const w = document.querySelector<HTMLElement>(
              "[data-moda4=footer-wordmark]",
            );
            if (!f || !w) return [false, `footer ${!!f}, wordmark ${!!w}`];
            const mark = w.querySelector("svg, img");
            if (!mark) return [false, "wordmark has no logo svg/img"];
            const r = mark.getBoundingClientRect();
            return [
              vw < 760 || r.width >= vw * 0.5,
              `wordmark width ${Math.round(r.width)}px`,
            ];
          },
        );
        await rule(
          page,
          ctx,
          "G4",
          "page ground is paper #F7F4EF (or kids pastel variant)",
          () => {
            const pick = (el: Element | null) =>
              el ? getComputedStyle(el).backgroundColor : "";
            const c =
              [
                pick(document.body),
                pick(document.querySelector("main")),
                pick(document.documentElement),
              ].find((x) => x && x !== "rgba(0, 0, 0, 0)") ?? "";
            const ok = ["rgb(247, 244, 239)", "rgb(255, 249, 245)"].includes(c);
            return [ok, c || "transparent"];
          },
        );
        await rule(
          page,
          ctx,
          "G5",
          "crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter",
          () => {
            const b = document.querySelector<HTMLElement>("[data-moda4-cta]");
            if (!b) return [false, "no [data-moda4-cta] on page"];
            const f = getComputedStyle(b, "::before").filter;
            const after = getComputedStyle(b, "::after");
            const stitch = after.borderStyle.includes("dashed");
            return [
              f.includes("url(") && stitch,
              `::before filter=${f}; ::after border=${after.borderStyle}`,
            ];
          },
        );
        await rule(page, ctx, "G6", "no horizontal overflow", (vw) => [
          document.documentElement.scrollWidth <= vw + 1,
          `scrollWidth ${document.documentElement.scrollWidth}`,
        ]);
        {
          const [count, bad] = await page.evaluate(() => {
            const els = Array.from(
              document.querySelectorAll<HTMLElement>("[data-moda4-display]"),
            ).filter((e) => e.getClientRects().length);
            return [
              els.length,
              els
                .filter(
                  (e) =>
                    !new RegExp(
                      document.documentElement.dataset.moda4TestFont ?? "",
                      "i",
                    ).test(getComputedStyle(e).fontFamily),
                )
                .map((e) => getComputedStyle(e).fontFamily.split(",")[0]),
            ];
          });
          const required = ["home", "fitting"].includes(name);
          results.push({
            ...ctx,
            id: "G7",
            rule:
              `display headings [data-moda4-display] use ${DISPLAY_FONT}` +
              (required ? " (at least one on this page)" : ""),
            pass: bad.length === 0 && (!required || count > 0),
            detail: bad.length
              ? `not ${DISPLAY_FONT}: ${bad.slice(0, 3).join(" / ")}`
              : `${count} visible`,
          });
        }

        {
          // Declared is not enough: the self-hosted display face must really load (D26/D77).
          const loaded = await page.evaluate(async (f) => {
            await document.fonts.ready;
            await Promise.allSettled([
              document.fonts.load(`700 48px "${f}"`, "MODA"),
              document.fonts.load(`700 48px "${f}"`, "ğşİ"),
            ]);
            return document.fonts.check(`700 48px "${f}"`, "MODA ğşİ");
          }, DISPLAY_FONT);
          results.push({
            ...ctx,
            id: "G8",
            rule: `${DISPLAY_FONT} is actually loaded from self-hosted files (incl. Turkish glyphs)`,
            pass: loaded,
            detail: loaded
              ? "loaded"
              : "not available — check @font-face/self-hosting",
          });
        }

        // ---------- page specific ----------
        if (name === "home") {
          await rule(
            page,
            ctx,
            "H1",
            "hero [data-moda4=hero] is full-bleed (edge to edge)",
            (vw) => {
              const h =
                document.querySelector<HTMLElement>("[data-moda4=hero]");
              if (!h) return [false, "missing"];
              const r = h.getBoundingClientRect();
              return [
                r.width >= vw - 2 && Math.abs(r.left) <= 1,
                `left ${Math.round(r.left)} width ${Math.round(r.width)} of ${vw}`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H2",
            desktop ? "hero height ≥ 50vw and ≥ 560px" : "hero height ≥ 600px",
            (vw) => {
              const h =
                document.querySelector<HTMLElement>("[data-moda4=hero]");
              if (!h) return [false, "missing"];
              const ht = h.getBoundingClientRect().height;
              return [
                vw >= 760 ? ht >= Math.max(vw * 0.5, 560) - 1 : ht >= 600,
                `height ${Math.round(ht)}px`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H3",
            "hero has ≥3 [data-moda4=hero-slide]; active image fills the hero and is top-anchored (no head crop)",
            () => {
              const h =
                document.querySelector<HTMLElement>("[data-moda4=hero]");
              const slides = document.querySelectorAll(
                "[data-moda4=hero-slide]",
              );
              if (!h || slides.length < 3)
                return [false, `${slides.length} slides`];
              const hr = h.getBoundingClientRect();
              const img = Array.from(
                h.querySelectorAll<HTMLImageElement>(
                  "[data-moda4=hero-slide] img",
                ),
              ).find((i) => {
                const r = i.getBoundingClientRect();
                return (
                  r.width > 0 &&
                  getComputedStyle(i).opacity !== "0" &&
                  getComputedStyle(i.closest("[data-moda4=hero-slide]")!)
                    .opacity !== "0"
                );
              });
              if (!img) return [false, "no visible slide image"];
              const r = img.getBoundingClientRect();
              const cover = (r.width * r.height) / (hr.width * hr.height);
              const pos = getComputedStyle(img).objectPosition.split(" ");
              const topAnchored = ["0%", "0px", "top"].includes(pos[1] ?? "");
              return [
                cover >= 0.95 && topAnchored,
                `${slides.length} slides, image covers ${(cover * 100).toFixed(0)}%, object-position ${pos.join(" ")}`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H4",
            `hero title [data-moda4=hero-title] is ${DISPLAY_FONT}, ≥56px desktop / ≥40px mobile`,
            (vw) => {
              const t = document.querySelector<HTMLElement>(
                "[data-moda4=hero-title]",
              );
              if (!t) return [false, "missing"];
              const cs = getComputedStyle(t);
              const size = parseFloat(cs.fontSize);
              return [
                new RegExp(
                  document.documentElement.dataset.moda4TestFont ?? "",
                  "i",
                ).test(cs.fontFamily) && size >= (vw >= 760 ? 56 : 40),
                `${cs.fontFamily.split(",")[0]} ${size}px`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H5",
            "hero progress bars [data-moda4=hero-progress]",
            () => [!!document.querySelector("[data-moda4=hero-progress]"), ""],
          );
          await rule(
            page,
            ctx,
            "H6",
            "home section order: hero → bands → worlds-prism → new-in → fitting-ad → shop-the-look → lookbook → kids-world → services",
            () => {
              const order = [
                "hero",
                "bands",
                "worlds-prism",
                "new-in",
                "fitting-ad",
                "shop-the-look",
                "lookbook",
                "kids-world",
                "services",
              ];
              const els = order.map((k) =>
                document.querySelector(`[data-moda4=${k}]`),
              );
              const missing = order.filter((_, i) => !els[i]);
              if (missing.length)
                return [false, "missing: " + missing.join(", ")];
              for (let i = 1; i < els.length; i++)
                if (
                  !(
                    els[i - 1]!.compareDocumentPosition(els[i]!) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  )
                )
                  return [false, `${order[i]} comes before ${order[i - 1]}`];
              return [true, "in order"];
            },
          );
          await rule(
            page,
            ctx,
            "H7",
            "two crossing marquee bands [data-moda4=band], both rotated",
            () => {
              const b = Array.from(
                document.querySelectorAll<HTMLElement>("[data-moda4=band]"),
              );
              const rot = b.filter(
                (x) => getComputedStyle(x).transform !== "none",
              );
              return [
                b.length === 2 && rot.length === 2,
                `${b.length} bands, ${rot.length} rotated`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H8",
            "worlds prism: preserve-3d, 4 faces [data-moda4=worlds-face] in 3:4",
            () => {
              const p = document.querySelector<HTMLElement>(
                "[data-moda4=worlds-prism]",
              );
              if (!p) return [false, "missing"];
              const faces = Array.from(
                p.querySelectorAll<HTMLElement>("[data-moda4=worlds-face]"),
              );
              const ratio = faces.length
                ? faces[0].offsetHeight / faces[0].offsetWidth
                : 0;
              const ok =
                getComputedStyle(p).transformStyle === "preserve-3d" &&
                faces.length === 4 &&
                Math.abs(ratio - 4 / 3) < 0.05;
              return [
                ok,
                `transform-style ${getComputedStyle(p).transformStyle}, ${faces.length} faces, ratio ${ratio.toFixed(2)}`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H9",
            "new-in rail [data-moda4=new-in] with ≥4 product cards, media 3:4",
            () => {
              const r = document.querySelector("[data-moda4=new-in]");
              if (!r) return [false, "missing"];
              const cards = r.querySelectorAll("[data-moda4=product-card]");
              const m = r.querySelector<HTMLElement>(
                "[data-moda4=product-card-media]",
              );
              const ratio = m ? m.offsetHeight / m.offsetWidth : 0;
              return [
                cards.length >= 4 && Math.abs(ratio - 4 / 3) < 0.05,
                `${cards.length} cards, media ratio ${ratio.toFixed(2)}`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H10",
            "3D fitting ad [data-moda4=fitting-ad] with rack and mannequin",
            () => {
              const a = document.querySelector("[data-moda4=fitting-ad]");
              return [
                !!a &&
                  !!a.querySelector("[data-moda4=fitting-ad-rack]") &&
                  !!a.querySelector("[data-moda4=fitting-ad-mannequin]"),
                a ? "" : "missing",
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H11",
            "shop-the-look [data-moda4=shop-the-look] is a full-bleed banner",
            (vw) => {
              const s = document.querySelector<HTMLElement>(
                "[data-moda4=shop-the-look]",
              );
              if (!s) return [false, "missing"];
              const r = s.getBoundingClientRect();
              return [r.width >= vw - 2, `width ${Math.round(r.width)}`];
            },
          );
          await rule(
            page,
            ctx,
            "H12",
            "lookbook ring: preserve-3d with ≥5 cards",
            () => {
              const r = document.querySelector<HTMLElement>(
                "[data-moda4=lookbook-ring]",
              );
              if (!r) return [false, "missing"];
              const n = r.querySelectorAll("[data-moda4=lookbook-card]").length;
              return [
                getComputedStyle(r).transformStyle === "preserve-3d" && n >= 5,
                `${getComputedStyle(r).transformStyle}, ${n} cards`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H13",
            `kids world: pastel gradient ground, ${DISPLAY_FONT} display heading, turntable ≥4 items`,
            () => {
              const k = document.querySelector<HTMLElement>(
                "[data-moda4=kids-world]",
              );
              if (!k) return [false, "missing"];
              const bg = getComputedStyle(k).backgroundImage;
              const h = k.querySelector<HTMLElement>(
                "[data-moda4-kids-display]",
              );
              const ff = h ? getComputedStyle(h).fontFamily : "";
              const items = k.querySelectorAll(
                "[data-moda4=kids-turntable-item]",
              ).length;
              return [
                bg.includes("gradient") &&
                  new RegExp(
                    document.documentElement.dataset.moda4TestFont ?? "",
                    "i",
                  ).test(ff) &&
                  items >= 4,
                `bg ${bg.slice(0, 30)}…, heading ${ff.split(",")[0] || "missing"}, ${items} items`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "H14",
            "services strip [data-moda4=services]",
            () => [!!document.querySelector("[data-moda4=services]"), ""],
          );
          await rule(
            page,
            ctx,
            "H15",
            "home page stays compact: no duplicated scenes (≤8,500px desktop / ≤9,500px mobile; prototype ≈6,800 / 7,700)",
            (vw) => {
              const h = document.documentElement.scrollHeight;
              return [h <= (vw >= 760 ? 8500 : 9500), `${h}px`];
            },
          );
          await rule(
            page,
            ctx,
            "H16",
            "no repeated full-size scenes: a visible photo ≥45% of the page wide appears at most twice",
            (vw) => {
              const shown = (el: Element | null): boolean => {
                for (
                  let e = el;
                  e && e !== document.body;
                  e = e.parentElement
                ) {
                  const cs = getComputedStyle(e);
                  if (
                    cs.visibility === "hidden" ||
                    cs.display === "none" ||
                    parseFloat(cs.opacity) < 0.05
                  )
                    return false;
                }
                return true;
              };
              const big = Array.from(
                document.querySelectorAll<HTMLImageElement>("main img"),
              ).filter((i) => {
                const r = i.getBoundingClientRect();
                return r.height >= 400 && r.width >= vw * 0.45 && shown(i);
              });
              const key = (i: HTMLImageElement) =>
                (i.currentSrc || i.src)
                  .replace(/[?#].*$/, "")
                  .replace(/\/_next\/image\?url=/, "");
              const counts = new Map<string, number>();
              big.forEach((i) =>
                counts.set(key(i), (counts.get(key(i)) ?? 0) + 1),
              );
              const worst = Math.max(0, ...counts.values());
              return [
                worst <= 2,
                `${big.length} large images, most repeated ×${worst}`,
              ];
            },
          );
        }

        if (name === "women" || name === "kids") {
          await rule(
            page,
            ctx,
            "C1",
            desktop
              ? "category grid [data-moda4=plp-grid]: ≥4 cards, 4 per row, media 3:4"
              : "category grid: ≥4 cards, 2 per row",
            (vw) => {
              const g = document.querySelector("[data-moda4=plp-grid]");
              if (!g) return [false, "missing"];
              const cards = Array.from(
                g.querySelectorAll<HTMLElement>("[data-moda4=product-card]"),
              );
              if (cards.length < 4) return [false, `${cards.length} cards`];
              const top = cards[0].getBoundingClientRect().top;
              const perRow = cards.filter(
                (c) => Math.abs(c.getBoundingClientRect().top - top) < 4,
              ).length;
              const m = g.querySelector<HTMLElement>(
                "[data-moda4=product-card-media]",
              );
              const ratio = m ? m.offsetHeight / m.offsetWidth : 0;
              return [
                perRow === (vw >= 1100 ? 4 : 2) &&
                  Math.abs(ratio - 4 / 3) < 0.05,
                `${cards.length} cards, ${perRow} per row, media ratio ${ratio.toFixed(2)}`,
              ];
            },
          );
        }
        if (name === "kids") {
          await rule(
            page,
            ctx,
            "K1",
            `kids presentation: pastel header [data-moda4=kids-header] with gradient + ${DISPLAY_FONT} heading`,
            () => {
              const h = document.querySelector<HTMLElement>(
                "[data-moda4=kids-header]",
              );
              if (!h || !h.getClientRects().length) return [false, "missing"];
              const t = h.querySelector<HTMLElement>(
                "[data-moda4-kids-display]",
              );
              const ok =
                getComputedStyle(h).backgroundImage.includes("gradient") &&
                !!t &&
                new RegExp(
                  document.documentElement.dataset.moda4TestFont ?? "",
                  "i",
                ).test(getComputedStyle(t).fontFamily);
              return [ok, getComputedStyle(h).backgroundImage.slice(0, 40)];
            },
          );
          await rule(
            page,
            ctx,
            "K2",
            "kids cards show cut-outs on a pastel gradient",
            () => {
              const m = document.querySelector<HTMLElement>(
                "[data-moda4=plp-grid] [data-moda4=product-card-media]",
              );
              if (!m) return [false, "missing"];
              return [
                getComputedStyle(m).backgroundImage.includes("gradient"),
                getComputedStyle(m).backgroundImage.slice(0, 40),
              ];
            },
          );
        }

        if (name === "product") {
          await rule(
            page,
            ctx,
            "P1",
            "gallery [data-moda4=pdp-gallery] and buy box [data-moda4=pdp-buybox]" +
              (desktop ? " side by side, buy box sticky" : ""),
            (vw) => {
              const g = document.querySelector<HTMLElement>(
                "[data-moda4=pdp-gallery]",
              );
              const b = document.querySelector<HTMLElement>(
                "[data-moda4=pdp-buybox]",
              );
              if (!g || !b) return [false, `gallery ${!!g}, buybox ${!!b}`];
              if (vw < 1100) return [true, "stacked on small screens"];
              const gr = g.getBoundingClientRect(),
                br = b.getBoundingClientRect();
              const side =
                Math.abs(gr.top - br.top) < 80 &&
                (gr.right <= br.left + 2 || br.right <= gr.left + 2);
              return [
                side && getComputedStyle(b).position === "sticky",
                `side-by-side ${side}, position ${getComputedStyle(b).position}`,
              ];
            },
          );
          await rule(
            page,
            ctx,
            "P2",
            "size buttons [data-moda4=pdp-sizes] ≥44px tall; add to bag is a crayon CTA",
            () => {
              const s = document.querySelector("[data-moda4=pdp-sizes]");
              const btn = s?.querySelector<HTMLElement>("button");
              const add = document.querySelector("[data-moda4=pdp-add]");
              const h = btn ? btn.getBoundingClientRect().height : 0;
              return [
                !!btn && h >= 44 && !!add && add.hasAttribute("data-moda4-cta"),
                `size button ${Math.round(h)}px, add ${add ? (add.hasAttribute("data-moda4-cta") ? "crayon" : "plain") : "missing"}`,
              ];
            },
          );
        }

        if (name === "fitting") {
          await rule(
            page,
            ctx,
            "F1",
            "try-on stage: 3D turntable (preserve-3d) with mannequin and ≥6 pickable items",
            () => {
              const s = document.querySelector("[data-moda4=tryon-stage]");
              const t = document.querySelector<HTMLElement>(
                "[data-moda4=tryon-turntable]",
              );
              const m = document.querySelector("[data-moda4=tryon-mannequin]");
              const n = document.querySelectorAll(
                "[data-moda4=tryon-item]",
              ).length;
              const ok =
                !!s &&
                !!t &&
                getComputedStyle(t).transformStyle === "preserve-3d" &&
                !!m &&
                n >= 6;
              return [
                ok,
                `stage ${!!s}, turntable ${t ? getComputedStyle(t).transformStyle : "missing"}, mannequin ${!!m}, ${n} items`,
              ];
            },
          );
          // Interaction: picking an item must put its garment on the mannequin immediately (no server round trip).
          const layers = () =>
            page.$$eval("[data-moda4=tryon-layer]", (els) =>
              els
                .filter((e) => e.getClientRects().length)
                .map(
                  (e) =>
                    e.getAttribute("data-item") ??
                    e.getAttribute("src") ??
                    e.getAttribute("data-id") ??
                    e.outerHTML.slice(0, 120),
                ),
            );
          const before = await layers();
          const pick = page
            .locator("[data-moda4=tryon-item][aria-pressed=false]")
            .first();
          let after = before;
          if (await pick.count()) {
            await pick.click();
            await page.waitForTimeout(900);
            after = await layers();
          }
          const added = after.filter((x) => !before.includes(x)).length;
          results.push({
            ...ctx,
            id: "F2",
            rule: "picking an item puts a new [data-moda4=tryon-layer] on the mannequin instantly",
            pass: added > 0,
            detail: `layers ${before.length} → ${after.length}, new ${added}`,
          });
        }

        if (name === "account") {
          await rule(
            page,
            ctx,
            "A1",
            "sign-in: [data-moda4=auth] split layout (image | form) on desktop with 3-step indicator",
            (vw) => {
              const a =
                document.querySelector<HTMLElement>("[data-moda4=auth]");
              const s = document.querySelector("[data-moda4=auth-steps]");
              if (!a || !s) return [false, `auth ${!!a}, steps ${!!s}`];
              const cols = getComputedStyle(a)
                .gridTemplateColumns.split(" ")
                .filter(Boolean).length;
              return [
                s.children.length === 3 && (vw < 760 || cols === 2),
                `${s.children.length} steps, ${cols} columns`,
              ];
            },
          );
        }
      });
    }
  });
}

test("fidelity summary (report + side-by-side)", async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "results.json"),
    JSON.stringify(results, null, 2),
  );
  const fails = results.filter((r) => !r.pass);
  const lines = [
    `# MODA4 fidelity — ${TARGET}`,
    "",
    `${results.length - fails.length} / ${results.length} checks pass.`,
    "",
    "| page | viewport | id | rule | result | detail |",
    "|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.page} | ${r.viewport} | ${r.id} | ${r.rule} | ${r.pass ? "PASS" : "**FAIL**"} | ${r.detail.replace(/\|/g, "/")} |`,
    ),
  ];
  fs.writeFileSync(path.join(OUT, "report.md"), lines.join("\n") + "\n");

  // Side-by-side images when the other target's screenshots exist.
  const other = path.join(
    ROOT,
    "test-results/moda4-fidelity",
    TARGET === "app" ? "prototype" : "app",
  );
  if (fs.existsSync(other)) await compare(browser, other);
  expect(
    fails.map(
      (f) => `${f.page}/${f.viewport} ${f.id}: ${f.rule} — ${f.detail}`,
    ),
  ).toEqual([]);
});

async function compare(
  browser: import("@playwright/test").Browser,
  other: string,
) {
  const cmp = path.join(ROOT, "test-results/moda4-fidelity/compare");
  fs.mkdirSync(cmp, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  for (const name of Object.keys(PAGES))
    for (const vp of VIEWPORTS) {
      const file = `${name}-${vp.width}.png`;
      const a = path.join(TARGET === "app" ? other : OUT, file);
      const b = path.join(TARGET === "app" ? OUT : other, file);
      if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
      const w = vp.width > 600 ? 760 : 390;
      const data = (f: string) =>
        "data:image/png;base64," + fs.readFileSync(f).toString("base64");
      await page.setContent(`<body style="margin:0;font:600 18px system-ui;background:#fff;display:flex;gap:24px;padding:12px">
        <div><div style="margin-bottom:8px">PROTOTYPE (approved)</div><img src="${data(a)}" style="width:${w}px;display:block"></div>
        <div><div style="margin-bottom:8px;color:#B93D0B">APP (current)</div><img src="${data(b)}" style="width:${w}px;display:block"></div></body>`);
      await page.setViewportSize({ width: w * 2 + 60, height: 1000 });
      await page.screenshot({
        path: path.join(cmp, file),
        fullPage: true,
        clip: undefined,
      });
    }
  await page.close();
}
