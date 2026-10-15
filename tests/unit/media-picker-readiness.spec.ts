import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForReadyMedia } from "@/components/admin/media-picker-readiness";
const item = {
  id: "cover",
  url: "/cover.webp",
  status: "READY",
  blurDataUrl: null,
  variants: null,
};
const response = (items: unknown[], status = 200) =>
  new Response(JSON.stringify({ items }), { status });
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("media picker readiness", () => {
  it("keeps processing uploads unselected until the exact image is ready", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([{ ...item, status: "PROCESSING" }]))
      .mockResolvedValueOnce(response([item]));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = waitForReadyMedia("cover", controller.signal);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toEqual(item);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/media?kind=image&id=cover",
      { signal: controller.signal, cache: "no-store" },
    );
  });
  it.each([
    response([{ ...item, status: "FAILED" }]),
    response([]),
    response([item], 403),
  ])("rejects failed, missing or unauthorized media", async (res) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
    await expect(
      waitForReadyMedia("cover", new AbortController().signal),
    ).rejects.toThrow("MEDIA_UNAVAILABLE");
  });
  it("accepts readiness after a full 60-second cron delay plus processing time", async () => {
    const started = Date.now();
    const fetcher = vi.fn().mockImplementation(async () =>
      response([
        {
          ...item,
          status: Date.now() - started >= 64000 ? "READY" : "PROCESSING",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = waitForReadyMedia("cover", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(64000);
    expect(await result).toEqual(item);
    expect(fetcher).toHaveBeenCalledTimes(33);
  });
  it("cancels polling and clears its timer when the dialog closes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response([{ ...item, status: "PROCESSING" }]));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = waitForReadyMedia("cover", controller.signal);
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops a never-ready upload after the bounded polling budget", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        response([{ ...item, status: "PROCESSING" }]),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = waitForReadyMedia("cover", new AbortController().signal);
    const rejected = expect(result).rejects.toThrow("MEDIA_NOT_READY");
    await vi.advanceTimersByTimeAsync(180000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(90);
  });
});

it("uses the selected video kind and rejects an image returned for a video upload", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      response([{ ...item, kind: "video", url: "/clip.webm" }]),
    );
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(await waitForReadyMedia("cover", signal, "video")).toMatchObject({
    kind: "video",
    url: "/clip.webm",
  });
  expect(fetcher).toHaveBeenCalledWith("/api/admin/media?kind=video&id=cover", {
    signal,
    cache: "no-store",
  });
  fetcher.mockResolvedValue(response([{ ...item, kind: "image" }]));
  await expect(waitForReadyMedia("cover", signal, "video")).rejects.toThrow(
    "MEDIA_UNAVAILABLE",
  );
});
