import type { MediaVariants } from "@/modules/media/constants";

export type PickerItem = {
  id: string;
  url: string;
  status: "PROCESSING" | "READY" | "FAILED";
  blurDataUrl: string | null;
  variants: MediaVariants | null;
};

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 2000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Never select a PROCESSING/FAILED upload or keep polling after cancellation. */
export async function waitForReadyMedia(id: string, signal: AbortSignal) {
  // Development cron ticks every 60s. Allow multiple ticks plus processing
  // time instead of timing out just before the first eligible tick.
  for (let attempt = 0; attempt < 90; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(
      `/api/admin/media?kind=image&id=${encodeURIComponent(id)}`,
      {
        signal,
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("MEDIA_UNAVAILABLE");
    const body = (await response.json()) as { items?: PickerItem[] };
    signal.throwIfAborted();
    const item = body.items?.find((row) => row.id === id);
    if (!item || item.status === "FAILED") throw new Error("MEDIA_UNAVAILABLE");
    if (item.status === "READY") return item;
    await pause(signal);
  }
  throw new Error("MEDIA_NOT_READY");
}
