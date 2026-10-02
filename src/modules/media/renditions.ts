import sharp from "sharp";
import type { StorageProvider } from "@/modules/integrations/storage";
import { IMAGE_FORMATS, IMAGE_WIDTHS, type MediaVariants } from "./constants";

/** One EXIF/resize contract for both initial optimization and replacement.
 * Sharp metadata describes the input; autoOrient describes the displayed size.
 * The encoded output's info, not the requested resize width, owns each key.
 */
export async function createRenditions(
  original: Buffer,
  target: StorageProvider,
  keyFor: (format: string, width: number) => string,
  createdKeys: string[] = [],
) {
  const base = sharp(original).rotate();
  const metadata = await base.metadata();
  const width = metadata.autoOrient.width;
  const height = metadata.autoOrient.height;
  if (!width || !height) throw new Error("could not read image dimensions");
  const widths: number[] = IMAGE_WIDTHS.filter((size) => size <= width);
  if (!widths.length) widths.push(width);
  const variants: MediaVariants = {};
  for (const format of IMAGE_FORMATS) {
    const values: NonNullable<MediaVariants[typeof format]> = {};
    for (const requestedWidth of widths) {
      const resized = base.clone().resize({
        width: requestedWidth,
        withoutEnlargement: true,
      });
      const { data, info } = await (
        format === "webp"
          ? resized.webp({ quality: 80 })
          : resized.avif({ quality: 60 })
      ).toBuffer({ resolveWithObject: true });
      const key = keyFor(format, info.width);
      // Record before put: a transport failure may happen after storage wrote.
      createdKeys.push(key);
      values[String(info.width)] = {
        key,
        url: await target.put(key, data, `image/${format}`),
        bytes: data.length,
        width: info.width,
        height: info.height,
      };
    }
    variants[format] = values;
  }
  const blur = await base
    .clone()
    .resize({ width: 16, withoutEnlargement: true })
    .webp({ quality: 20 })
    .toBuffer();
  const { data: color } = await base
    .clone()
    .resize(1, 1, { fit: "cover" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width,
    height,
    variants,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    dominantColor: `#${[...color.subarray(0, 3)].map((c) => c.toString(16).padStart(2, "0")).join("")}`,
  };
}
