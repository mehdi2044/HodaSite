import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { createRenditions } from "@/modules/media/renditions";
import { ResponsiveImage } from "@/components/storefront/responsive-image";
import { IMAGE_WIDTHS } from "@/modules/media/constants";
import type { StorageProvider } from "@/modules/integrations/storage";

describe("real encoded EXIF renditions", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  afterAll(() => vi.unstubAllGlobals());
  it.each([1, 3, 6, 8])(
    "rotates pixels, not only dimensions, for EXIF %s",
    async (orientation) => {
      const width = 80,
        height = 60;
      const pixels = Buffer.alloc(width * height * 3);
      const corners = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
      ];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const rgb =
            corners[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)];
          pixels.set(rgb, (y * width + x) * 3);
        }
      const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } })
        .withMetadata({ orientation })
        .jpeg({ quality: 100 })
        .toBuffer();
      const files = new Map<string, Buffer>();
      const target: StorageProvider = {
        async put(key, bytes) {
          files.set(key, bytes);
          return key;
        },
        async getBytes(key) {
          return files.get(key) ?? null;
        },
        async getSignedUrl(key) {
          return key;
        },
        async delete(key) {
          files.delete(key);
        },
      };
      const result = await createRenditions(
        jpeg,
        target,
        (format, size) => `media/pixels/${size}.${format}`,
      );
      const topLeft =
        orientation === 3
          ? corners[3]
          : orientation === 6
            ? corners[2]
            : orientation === 8
              ? corners[1]
              : corners[0];
      for (const values of Object.values(result.variants)) {
        const file = Object.values(values)[0];
        const { data, info } = await sharp(files.get(file.key)!)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const offset = (5 * info.width + 5) * info.channels;
        topLeft.forEach((channel, i) =>
          expect(Math.abs(data[offset + i] - channel)).toBeLessThan(25),
        );
      }
    },
  );
  for (const [width, height] of [
    [1200, 800],
    [800, 1200],
    [640, 640],
    [90, 60],
    [2040, 2000],
  ])
    for (const orientation of [undefined, 1, 3, 6, 8])
      it(`${width}x${height}, orientation ${orientation ?? "absent"}`, async () => {
        let input = sharp({
          create: { width, height, channels: 3, background: "#c47d32" },
        }).jpeg();
        if (orientation) input = input.withMetadata({ orientation });
        const original = await input.toBuffer();
        const files = new Map<string, Buffer>();
        const target: StorageProvider = {
          async put(key, bytes) {
            files.set(key, bytes);
            return `/media/${key}`;
          },
          async getBytes(key) {
            return files.get(key) ?? null;
          },
          async getSignedUrl(key) {
            return `/media/${key}`;
          },
          async delete(key) {
            files.delete(key);
          },
        };
        const result = await createRenditions(
          original,
          target,
          (format, size) => `media/test/${size}.${format}`,
        );
        const swapped = orientation === 6 || orientation === 8;
        const expectedWidth = swapped ? height : width;
        const expectedHeight = swapped ? width : height;
        expect([result.width, result.height]).toEqual([
          expectedWidth,
          expectedHeight,
        ]);
        const expectedSizes = IMAGE_WIDTHS.filter(
          (size) => size <= expectedWidth,
        );
        const html = renderToStaticMarkup(
          createElement(ResponsiveImage, {
            media: { ...result, url: "/original", altI18n: {} },
            locale: "en",
            sizes: "100vw",
          }),
        );
        for (const format of ["webp", "avif"] as const) {
          expect(
            Object.keys(result.variants[format] ?? {}).map(Number),
          ).toEqual(expectedSizes.length ? expectedSizes : [expectedWidth]);
          for (const [descriptor, item] of Object.entries(
            result.variants[format] ?? {},
          )) {
            const actual = await sharp(files.get(item.key)!).metadata();
            expect(actual.width).toBe(Number(descriptor));
            expect(actual.width).toBe(item.width);
            expect(actual.height).toBe(item.height);
            expect(actual.width).toBeLessThanOrEqual(expectedWidth);
            expect(actual.height).toBe(
              Math.round((expectedHeight * actual.width!) / expectedWidth),
            );
            expect(actual.orientation).toBeUndefined();
            expect(actual.exif).toBeUndefined();
            expect(html).toContain(`${item.url} ${actual.width}w`);
          }
        }
        const blur = await sharp(
          Buffer.from(result.blurDataUrl.split(",")[1], "base64"),
        ).metadata();
        expect(blur.width).toBe(Math.min(16, expectedWidth));
        expect(blur.height).toBe(
          Math.round((expectedHeight * blur.width!) / expectedWidth),
        );
        expect(result.dominantColor).toMatch(/^#[a-f0-9]{6}$/);
      }, 30_000);
});
