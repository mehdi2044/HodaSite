const MAX_BYTES = 20_000;

export class CustomCssError extends Error {}

/**
 * Sanitize the theme editor's custom-CSS textarea (Phase 01a §3). This is not
 * a full CSS parser — it rejects the constructs that could exfiltrate data,
 * pull in a remote stylesheet, or inject markup, and caps size.
 */
export function sanitizeCustomCss(input: string): string {
  const css = input.trim();
  if (css.length === 0) return "";

  if (Buffer.byteLength(css, "utf8") > MAX_BYTES)
    throw new CustomCssError(`Custom CSS exceeds ${MAX_BYTES} bytes`);
  if (/@import/i.test(css))
    throw new CustomCssError("@import is not allowed in custom CSS");
  if (/url\s*\(\s*['"]?\s*(https?:)?\/\//i.test(css))
    throw new CustomCssError("External url() references are not allowed");
  if (/expression\s*\(/i.test(css))
    throw new CustomCssError("expression() is not allowed");
  if (/</.test(css))
    throw new CustomCssError("Custom CSS may not contain markup");

  return css;
}
