/** Widths generated for every raster image (never upscaled past the original). */
export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export const IMAGE_FORMATS = ["webp", "avif"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const MAX_IMAGE_BYTES = 10_000_000;
export const MAX_PDF_BYTES = 5_000_000;
export const MAX_IMAGE_DIMENSION = 8000;

export const RASTER_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

// Allow-list keyed by the *sniffed* MIME, never the client-supplied
// filename/content-type (D40).
export const ALLOWED_MIME: Record<string, { ext: string; kind: string }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "application/pdf": { ext: "pdf", kind: "document" },
};

export type MediaVariants = {
  [format in ImageFormat]?: {
    [width in `${ImageWidth}`]?: { key: string; url: string; bytes: number };
  };
};

export const PURGE_RETENTION_DAYS_DEFAULT = 30;

export const MEDIA_OPTIMIZE_JOB = "media-optimize";
export const MEDIA_PURGE_JOB = "media-purge";
export const MEDIA_REPLACE_JOB = "media-replace";
