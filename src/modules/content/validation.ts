import { z } from "zod";

export const LOCALES = ["fa", "tr", "en"] as const;
export const MARKET_CODES = ["IR", "TR", "CA"] as const;
export const MENU_KEYS = ["header", "mobile", "footer"] as const;

export const localizedTextSchema = z.object({
  fa: z.string().trim().max(20_000).default(""),
  tr: z.string().trim().max(20_000).default(""),
  en: z.string().trim().max(20_000).default(""),
});

const requiredLocalizedTextSchema = localizedTextSchema.refine(
  (value) => LOCALES.every((locale) => value[locale].length > 0),
  "missing_translation",
);

const slugPart = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);

export const localizedSlugSchema = z.object({
  fa: slugPart,
  tr: slugPart,
  en: slugPart,
});

export function isSafeLink(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const safeLinkSchema = z.string().trim().max(2_048).refine(isSafeLink);

const forbiddenHtml =
  /<(script|style|iframe|object|embed|form|input|button|svg|math)\b|\son[a-z]+\s*=|\sstyle\s*=|javascript\s*:/i;

const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "blockquote",
  "a",
  "code",
  "bdi",
]);

/** A deliberately small HTML allowlist. Input is rejected if it attempts to
 * introduce active content; this function is repeated at render time. */
export function sanitizeRichText(input: string): string {
  if (input.length > 50_000 || forbiddenHtml.test(input))
    throw new Error("unsafe_rich_text");

  return input.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag, attrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const match = String(attrs).match(/\bhref\s*=\s*(["'])(.*?)\1/i);
      if (!match || !isSafeLink(match[2])) return "<a>";
      const href = match[2].replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return `<a href="${href}" rel="noopener noreferrer">`;
    }
    if (tag === "p" || tag === "bdi") {
      const dir = String(attrs).match(
        /\bdir\s*=\s*["'](rtl|ltr|auto)["']/i,
      )?.[1];
      return dir ? `<${tag} dir="${dir.toLowerCase()}">` : `<${tag}>`;
    }
    return `<${tag}>`;
  });
}

const safeHtmlString = z
  .string()
  .max(50_000)
  .refine((value) => !forbiddenHtml.test(value), "unsafe_rich_text")
  .transform(sanitizeRichText);

const richTextI18nSchema = z.object({
  fa: safeHtmlString.default(""),
  tr: safeHtmlString.default(""),
  en: safeHtmlString.default(""),
});

const mediaId = z.string().trim().min(1).max(100);

export const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RichText"), html: richTextI18nSchema }),
  z.object({
    type: z.literal("Image"),
    mediaId,
    caption: localizedTextSchema.default({ fa: "", tr: "", en: "" }),
  }),
  z.object({
    type: z.literal("Hero"),
    mediaId: mediaId.optional(),
    title: localizedTextSchema,
    body: localizedTextSchema.default({ fa: "", tr: "", en: "" }),
    ctaLabel: localizedTextSchema.default({ fa: "", tr: "", en: "" }),
    ctaUrl: safeLinkSchema.optional(),
  }),
  z.object({
    type: z.literal("TwoColumns"),
    left: richTextI18nSchema,
    right: richTextI18nSchema,
  }),
  z.object({
    type: z.literal("FAQ"),
    items: z
      .array(
        z.object({ question: localizedTextSchema, answer: richTextI18nSchema }),
      )
      .max(30),
  }),
  z.object({
    type: z.literal("CTA"),
    title: localizedTextSchema,
    label: localizedTextSchema,
    url: safeLinkSchema,
  }),
  z.object({
    type: z.literal("Countdown"),
    title: localizedTextSchema,
    endsAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("Embed"),
    title: requiredLocalizedTextSchema,
    url: z.string().trim().max(2_048).refine(isAllowedEmbedUrl),
  }),
]);

export const pageBlocksSchema = z.array(contentBlockSchema).max(50);

export function isAllowedEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ["www.youtube.com", "youtube.com", "player.vimeo.com"].includes(
      url.hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

export const pageInputSchema = z.object({
  id: z.string().optional(),
  titleI18n: requiredLocalizedTextSchema,
  slugI18n: localizedSlugSchema,
  type: z.enum(["static", "landing"]),
  status: z.enum(["draft", "published"]),
  marketIds: z
    .array(z.string().min(1).max(100))
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate_market"),
  seoI18n: z.object({
    title: localizedTextSchema,
    description: localizedTextSchema,
  }),
  blocks: pageBlocksSchema,
});

export const menuItemInputSchema = z
  .object({
    id: z.string().optional(),
    menuId: z.string().min(1),
    parentId: z.string().optional(),
    labelI18n: requiredLocalizedTextSchema,
    linkType: z.enum(["url", "page", "category", "collection"]),
    url: safeLinkSchema.optional(),
    pageId: z.string().optional(),
    referenceId: z.string().optional(),
    target: z.enum(["_self", "_blank"]),
    enabled: z.boolean(),
    visibleIn: z.array(z.enum(MARKET_CODES)).max(3),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .superRefine((value, ctx) => {
    const required =
      value.linkType === "url"
        ? value.url
        : value.linkType === "page"
          ? value.pageId
          : value.referenceId;
    if (!required)
      ctx.addIssue({ code: "custom", message: "missing_link_target" });
  });

export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type PageInput = z.infer<typeof pageInputSchema>;
export type MenuItemInput = z.infer<typeof menuItemInputSchema>;

export function isValidMenuParent(input: {
  itemId?: string;
  menuId: string;
  parentId?: string;
  parentMenuId?: string;
  parentParentId?: string | null;
  currentHasChildren?: boolean;
}): boolean {
  if (!input.parentId) return true;
  return Boolean(
    input.parentMenuId === input.menuId &&
    input.parentParentId === null &&
    input.parentId !== input.itemId &&
    !input.currentHasChildren,
  );
}
