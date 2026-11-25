import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";

type Frame = {
  wallMs: number;
  lookId: string | null;
  phase: string | null;
  clockMs: number;
  flightOpaque: boolean;
  scanOpacity: number;
  scanVisible: boolean;
  revealOpacity: number;
  photoSrc: string;
  photoLoaded: boolean;
};
export type Cycle = {
  click?: { lookId: string; trusted: boolean; wallMs: number };
  frames: Frame[];
  ready?: Frame;
  advanced: boolean;
  stopped: boolean;
};
type CycleWindow = Window & { __m402Cycle?: Cycle };

/** Observe the actual painted cycle, not a later Locator RPC's current look.
 * Never changes application styles, clock, autoplay or pause state.
 */
export async function observeM402Cycle(
  page: Page,
  lookId: string,
  trigger: "choice" | "replay",
) {
  const cdp = await page.context().newCDPSession(page);
  const screenshots: { wallMs: number; data: string }[] = [];
  cdp.on(
    "Page.screencastFrame",
    (event: {
      sessionId: number;
      metadata: { timestamp?: number };
      data: string;
    }) => {
      if (event.metadata.timestamp && screenshots.length < 600)
        screenshots.push({
          wallMs: event.metadata.timestamp * 1000,
          data: event.data,
        });
      void cdp.send("Page.screencastFrameAck", {
        sessionId: event.sessionId,
      });
    },
  );
  await page.evaluate(
    ({ lookId, trigger }) => {
      const current = window as CycleWindow;
      if (current.__m402Cycle) current.__m402Cycle.stopped = true;
      const cycle: Cycle = { frames: [], advanced: false, stopped: false };
      current.__m402Cycle = cycle;
      const click = (event: MouseEvent) => {
        const button =
          event.target instanceof Element
            ? event.target.closest(
                trigger === "choice" ? "[data-m4-look]" : "[data-m4-replay]",
              )
            : null;
        if (
          !button ||
          (trigger === "choice" &&
            button.getAttribute("data-m4-look") !== lookId)
        )
          return;
        cycle.click = { lookId, trusted: event.isTrusted, wallMs: Date.now() };
        document.removeEventListener("click", click, true);
      };
      document.addEventListener("click", click, true);
      function sample() {
        if (cycle.stopped) {
          document.removeEventListener("click", click, true);
          return;
        }
        const ad = document.querySelector('[data-moda4="fitting-ad"]');
        const stage = ad?.querySelector<HTMLElement>("[data-m4-stage]");
        if (cycle.click && stage) {
          const activeId =
            ad
              ?.querySelector('[data-m4-look][aria-pressed="true"]')
              ?.getAttribute("data-m4-look") ?? null;
          // React may still be committing the clicked look in this event's frame.
          const began = cycle.frames.length > 0;
          if (activeId === lookId || began) {
            const scan = stage.querySelector<HTMLElement>(".m4-scan");
            const reveal = stage.querySelector<HTMLElement>(".m4-reveal");
            const photo = reveal?.querySelector("img");
            const rect = scan?.getBoundingClientRect();
            const hit = rect
              ? document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                )
              : null;
            // The animated stage intentionally has pointer-events:none.
            const visible = Boolean(
              rect &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight &&
              hit &&
              stage.closest(".m4-scene-box")?.contains(hit),
            );
            const row: Frame = {
              wallMs: Date.now(),
              lookId: activeId,
              phase: stage.getAttribute("data-step"),
              clockMs: Number(stage.style.getPropertyValue("--m4-time")),
              flightOpaque: [
                ...stage.querySelectorAll("[data-m4-flight]"),
              ].some((node) => Number(getComputedStyle(node).opacity) > 0.5),
              scanOpacity: scan ? Number(getComputedStyle(scan).opacity) : 0,
              scanVisible: visible,
              revealOpacity: reveal
                ? Number(getComputedStyle(reveal).opacity)
                : 0,
              photoSrc: photo?.getAttribute("src") ?? "",
              photoLoaded: Boolean(photo?.complete && photo.naturalWidth > 0),
            };
            cycle.frames.push(row);
            if (activeId !== lookId) cycle.advanced = true;
            if (
              !cycle.ready &&
              row.phase === "look" &&
              row.revealOpacity === 1 &&
              row.photoLoaded
            )
              cycle.ready = row;
          }
        }
        if (cycle.frames.length < 1800) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    },
    { lookId, trigger },
  );
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 85,
    everyNthFrame: 3,
  });
  return {
    async ready() {
      const handle = await page.waitForFunction(
        () => {
          const cycle = (window as CycleWindow).__m402Cycle;
          return cycle?.ready || cycle?.advanced ? cycle : null;
        },
        undefined,
        // Same deadline as the original M4 assertion configuration.
        { timeout: 10_000, polling: "raf" },
      );
      return (await handle.jsonValue()) as Cycle;
    },
    async finish(info: TestInfo, prefix: string) {
      await cdp.send("Page.stopScreencast");
      const cycle = await page.evaluate(() => {
        const cycle = (window as CycleWindow).__m402Cycle;
        if (cycle) cycle.stopped = true;
        return cycle;
      });
      if (cycle) {
        for (const phase of ["dress", "style"] as const) {
          const matches = (frame: Frame) =>
            frame.lookId === lookId &&
            frame.phase === phase &&
            (phase === "dress"
              ? frame.flightOpaque
              : frame.scanVisible && frame.scanOpacity > 0.5);
          const shot = screenshots.find((shot) => {
            const before = cycle.frames.findLast(
              (frame) => frame.wallMs <= shot.wallMs,
            );
            const after = cycle.frames.find(
              (frame) => frame.wallMs >= shot.wallMs,
            );
            return (
              before &&
              after &&
              matches(before) &&
              matches(after) &&
              after.wallMs - before.wallMs < 150
            );
          });
          if (shot)
            await writeFile(
              info.outputPath(`${prefix}-${phase}.jpg`),
              Buffer.from(shot.data, "base64"),
            );
        }
        await info.attach(`${prefix}-same-cycle-frames`, {
          body: JSON.stringify(cycle),
          contentType: "application/json",
        });
      }
      await cdp.detach();
    },
  };
}
