import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  pageBlocksSchema,
  isSafeLink,
  sanitizeRichText,
  type ContentBlock,
} from "./validation";

export * from "./validation";
export * from "./homepage";
export * from "./translations";

export type Localized = Partial<Record<"fa" | "tr" | "en", string>>;
export type PublicMenuItem = {
  id: string;
  label: string;
  href?: string;
  target: "_self" | "_blank";
  placeholder: boolean;
  children: PublicMenuItem[];
};

const getMenuRows = unstable_cache(
  async (key: string, marketId: string) =>
    db.menu.findMany({
      where: {
        key,
        deletedAt: null,
        OR: [{ marketId }, { marketId: null }],
      },
      include: {
        items: {
          where: { deletedAt: null, enabled: true },
          include: { page: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ["content-menu"],
  { tags: ["menus"] },
);

export async function getMenu(
  key: "header" | "mobile" | "footer",
  marketId: string,
  marketCode: string,
  locale: "fa" | "tr" | "en",
): Promise<PublicMenuItem[]> {
  const rows = await getMenuRows(key, marketId);
  const menu =
    rows.find((row) => row.marketId === marketId) ??
    rows.find((row) => row.marketId === null);
  if (!menu) return [];
  const allowed = menu.items.filter(
    (item) =>
      item.visibleIn.length === 0 || item.visibleIn.includes(marketCode),
  );
  const byParent = new Map<string | null, typeof allowed>();
  for (const item of allowed) {
    const parent =
      item.parentId &&
      allowed.some((candidate) => candidate.id === item.parentId)
        ? item.parentId
        : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
  }
  const toPublic = (
    item: (typeof allowed)[number],
    depth: number,
  ): PublicMenuItem => {
    const label =
      (item.labelI18n as Localized)[locale] ||
      (item.labelI18n as Localized).fa ||
      "";
    const pageSlugs = item.page?.slugI18n as Localized | undefined;
    const localizedSlug = pageSlugs?.[locale] ?? pageSlugs?.fa;
    const pageVisible =
      item.page?.status === "published" &&
      !item.page.deletedAt &&
      Boolean(localizedSlug) &&
      (item.page.marketIds.length === 0 ||
        item.page.marketIds.includes(marketId));
    const href =
      item.linkType === "url"
        ? item.url && isSafeLink(item.url)
          ? item.url
          : undefined
        : item.linkType === "page" && pageVisible
          ? `/${locale}/pages/${localizedSlug}`
          : undefined;
    return {
      id: item.id,
      label,
      href,
      target: item.target === "_blank" ? "_blank" : "_self",
      placeholder:
        item.linkType === "category" || item.linkType === "collection" || !href,
      children:
        depth < 1
          ? (byParent.get(item.id) ?? []).map((child) =>
              toPublic(child, depth + 1),
            )
          : [],
    };
  };
  return (byParent.get(null) ?? []).map((item) => toPublic(item, 0));
}

const getPublishedPages = unstable_cache(
  async () =>
    db.page.findMany({
      where: { status: "published", deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ["published-pages"],
  { tags: ["pages"] },
);

export async function getPublishedPage(
  slug: string,
  locale: "fa" | "tr" | "en",
  marketId: string,
) {
  const pages = await getPublishedPages();
  const page = pages.find((candidate) => {
    const slugs = candidate.slugI18n as Localized;
    return (
      slugs[locale] === slug &&
      (candidate.marketIds.length === 0 ||
        candidate.marketIds.includes(marketId))
    );
  });
  if (!page) return null;
  const parsed = pageBlocksSchema.safeParse(page.blocks);
  if (!parsed.success) return null;
  return { ...page, blocks: sanitizeBlocksForRender(parsed.data) };
}

export function sanitizeBlocksForRender(
  blocks: ContentBlock[],
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "RichText")
      return { ...block, html: mapLocalized(block.html, sanitizeRichText) };
    if (block.type === "TwoColumns")
      return {
        ...block,
        left: mapLocalized(block.left, sanitizeRichText),
        right: mapLocalized(block.right, sanitizeRichText),
      };
    if (block.type === "FAQ")
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          answer: mapLocalized(item.answer, sanitizeRichText),
        })),
      };
    return block;
  });
}

function mapLocalized<T extends Localized>(
  value: T,
  fn: (input: string) => string,
): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, text]) => [key, fn(text ?? "")]),
  ) as T;
}
