import {
  isAllowedEmbedUrl,
  isSafeLink,
  sanitizeRichText,
  type ContentBlock,
} from "./validation";

export const CONTENT_BLOCK_TYPES = [
  "RichText",
  "Image",
  "Hero",
  "TwoColumns",
  "FAQ",
  "CTA",
  "Countdown",
  "Embed",
] as const;

export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];
export type EditorLocale = "fa" | "tr" | "en";
export type PreviewMediaUrls = Record<string, string>;

const emptyLocalized = () => ({ fa: "", tr: "", en: "" });

export function createEmptyContentBlock(type: ContentBlockType): ContentBlock {
  switch (type) {
    case "RichText":
      return { type, html: emptyLocalized() };
    case "Image":
      return { type, mediaId: "", caption: emptyLocalized() };
    case "Hero":
      return {
        type,
        title: emptyLocalized(),
        body: emptyLocalized(),
        ctaLabel: emptyLocalized(),
      };
    case "TwoColumns":
      return { type, left: emptyLocalized(), right: emptyLocalized() };
    case "FAQ":
      return {
        type,
        items: [{ question: emptyLocalized(), answer: emptyLocalized() }],
      };
    case "CTA":
      return {
        type,
        title: emptyLocalized(),
        label: emptyLocalized(),
        url: "/",
      };
    case "Countdown":
      return {
        type,
        title: emptyLocalized(),
        endsAt: "2030-01-01T00:00:00.000Z",
      };
    case "Embed":
      return { type, title: emptyLocalized(), url: "" };
  }
}

export function serializeContentBlocks(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

/**
 * Builds the live, unsaved preview document. This is deliberately separate
 * from storefront rendering: it never fetches, writes, or evaluates scripts.
 * The iframe using it is also sandboxed without permissions.
 */
export function buildSafePagePreview(
  blocks: ContentBlock[],
  locale: EditorLocale,
  mediaUrls: PreviewMediaUrls = {},
): string {
  const dir = locale === "fa" ? "rtl" : "ltr";
  const rendered = blocks
    .map((block) => renderPreviewBlock(block, locale, mediaUrls))
    .join("");
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: http: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light;--accent:#e8792a}*{box-sizing:border-box}body{margin:0;padding:24px;background:#fbf8f3;color:#1a1a1a;font-family:system-ui,sans-serif;line-height:1.7}.stack{display:grid;gap:24px}.panel{padding:24px;border-radius:16px;background:#fff;box-shadow:0 8px 30px #39230b12}.hero{min-height:260px;display:grid;align-content:end;background:#eee center/cover no-repeat}.hero h2{font-size:2rem;margin:0}.hero p{margin:.5rem 0 0}.button{display:inline-block;margin-top:12px;padding:9px 18px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none}.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.image{width:100%;max-height:520px;object-fit:cover;border-radius:14px}.muted{color:#686868;font-size:.9rem}.faq{padding:12px 0;border-bottom:1px solid #ddd}.embed{border:1px dashed #aaa;text-align:center}.countdown{text-align:center}a{color:#9a4b16}h2,h3,p{overflow-wrap:anywhere}@media(max-width:520px){body{padding:14px}.panel{padding:18px}.columns{grid-template-columns:1fr}}
</style>
</head>
<body><main class="stack">${rendered}</main></body>
</html>`;
}

function renderPreviewBlock(
  block: ContentBlock,
  locale: EditorLocale,
  mediaUrls: PreviewMediaUrls,
): string {
  const local = (value: Partial<Record<EditorLocale, string>>) =>
    value[locale] || value.fa || value.en || "";
  if (block.type === "RichText")
    return `<section class="panel">${safePreviewRichText(local(block.html))}</section>`;
  if (block.type === "Image") {
    const src = safePreviewImageUrl(mediaUrls[block.mediaId]);
    return `<figure class="panel">${src ? `<img class="image" src="${escapeAttribute(src)}" alt="">` : ""}<figcaption class="muted">${escapeHtml(local(block.caption))}</figcaption></figure>`;
  }
  if (block.type === "Hero") {
    const src = block.mediaId
      ? safePreviewImageUrl(mediaUrls[block.mediaId])
      : undefined;
    const safeUrl =
      block.ctaUrl && isSafeLink(block.ctaUrl) ? block.ctaUrl : undefined;
    return `<section class="panel hero"${src ? ` style="background-image:linear-gradient(#ffffff88,#ffffff88),url('${escapeCssUrl(src)}')"` : ""}><h2>${escapeHtml(local(block.title))}</h2><p>${escapeHtml(local(block.body))}</p>${safeUrl && local(block.ctaLabel) ? `<a class="button" href="${escapeAttribute(safeUrl)}">${escapeHtml(local(block.ctaLabel))}</a>` : ""}</section>`;
  }
  if (block.type === "TwoColumns")
    return `<section class="columns"><div class="panel">${safePreviewRichText(local(block.left))}</div><div class="panel">${safePreviewRichText(local(block.right))}</div></section>`;
  if (block.type === "FAQ")
    return `<section class="panel">${block.items.map((item) => `<div class="faq"><strong>${escapeHtml(local(item.question))}</strong><div>${safePreviewRichText(local(item.answer))}</div></div>`).join("")}</section>`;
  if (block.type === "CTA") {
    const safeUrl = isSafeLink(block.url) ? block.url : "#";
    return `<section class="panel"><h2>${escapeHtml(local(block.title))}</h2><a class="button" href="${escapeAttribute(safeUrl)}">${escapeHtml(local(block.label))}</a></section>`;
  }
  if (block.type === "Countdown")
    return `<section class="panel countdown"><h2>${escapeHtml(local(block.title))}</h2><time dir="ltr">${escapeHtml(block.endsAt)}</time></section>`;

  const approved = isAllowedEmbedUrl(block.url);
  return `<section class="panel embed"><h2>${escapeHtml(local(block.title))}</h2><p class="muted">${approved ? escapeHtml(block.url) : ""}</p></section>`;
}

function safePreviewRichText(value: string): string {
  try {
    return sanitizeRichText(value);
  } catch {
    return `<p>${escapeHtml(stripTags(removeActiveElements(value)))}</p>`;
  }
}

function removeActiveElements(value: string): string {
  return value.replace(
    /<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function escapeCssUrl(value: string): string {
  return value.replace(/[\\'"()\n\r]/g, "");
}

function safePreviewImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/media/")) return value;
  if (value.startsWith("blob:")) return value;
  if (/^data:image\/(png|jpeg|webp|avif);base64,/i.test(value)) return value;
  return undefined;
}
