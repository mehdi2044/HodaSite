import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  pageBlocksSchema,
  isSafeLink,
  sanitizeRichText,
  type ContentBlock,
} from "./validation";
import { menuPresentation } from "./menu-presentation";
import { seoPath } from "@/lib/seo-urls";
import type { Media } from "@prisma/client";

export * from "./validation";
export * from "./homepage";
export * from "./translations";
export * from "./menu-presentation";
export { writeMenuItem } from "./menu-writes";

export type Localized = Partial<Record<"fa" | "tr" | "en", string>>;
export type PublicMenuItem = {
  id: string;
  label: string;
  href?: string;
  target: "_self" | "_blank";
  placeholder: boolean;
  children: PublicMenuItem[];
  image?: Pick<
    Media,
    | "id"
    | "url"
    | "variants"
    | "width"
    | "height"
    | "blurDataUrl"
    | "altI18n"
    | "originalName"
  >;
  presentation?: ReturnType<typeof menuPresentation>;
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
  const categoryIds = allowed
    .filter((item) => item.linkType === "category")
    .flatMap((item) => (item.referenceId ? [item.referenceId] : []));
  const collectionIds = allowed
    .filter((item) => item.linkType === "collection")
    .flatMap((item) => (item.referenceId ? [item.referenceId] : []));
  const pageIds = allowed.flatMap((item) => (item.pageId ? [item.pageId] : []));
  const mediaIds = allowed.flatMap((item) =>
    menuPresentation(item.presentation).mediaId
      ? [menuPresentation(item.presentation).mediaId!]
      : [],
  );
  const [categories, collections, images, pages] = await Promise.all([
    categoryIds.length
      ? db.category.findMany({
          where: { id: { in: categoryIds }, deletedAt: null },
          select: { id: true, slugI18n: true },
        })
      : [],
    collectionIds.length
      ? db.collection.findMany({
          where: { id: { in: collectionIds }, deletedAt: null },
          select: { id: true },
        })
      : [],
    mediaIds.length
      ? db.media.findMany({
          where: {
            id: { in: mediaIds },
            kind: "image",
            status: "READY",
            deletedAt: null,
          },
          select: {
            id: true,
            url: true,
            variants: true,
            width: true,
            height: true,
            blurDataUrl: true,
            altI18n: true,
            originalName: true,
          },
        })
      : [],
    pageIds.length
      ? db.page.findMany({
          where: { id: { in: pageIds }, deletedAt: null },
          select: {
            id: true,
            slugI18n: true,
            status: true,
            deletedAt: true,
            marketIds: true,
          },
        })
      : [],
  ]);
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
    const page = pages.find((row) => row.id === item.pageId);
    const pageSlugs = page?.slugI18n as Localized | undefined;
    const localizedSlug = pageSlugs?.[locale] ?? pageSlugs?.fa;
    const pageVisible =
      page?.status === "published" &&
      !page.deletedAt &&
      Boolean(localizedSlug) &&
      (page.marketIds.length === 0 || page.marketIds.includes(marketId));
    const category = categories.find((row) => row.id === item.referenceId);
    const categorySlug = category
      ? (category.slugI18n as Localized)[locale] ||
        (category.slugI18n as Localized).en
      : undefined;
    const collection = collections.find((row) => row.id === item.referenceId);
    const presentation = menuPresentation(item.presentation);
    const href =
      item.linkType === "url"
        ? item.url && isSafeLink(item.url)
          ? item.url
          : undefined
        : item.linkType === "page" && pageVisible
          ? seoPath(locale, marketCode, "pages", localizedSlug)
          : item.linkType === "category" && categorySlug
            ? seoPath(locale, marketCode, "c", categorySlug)
            : item.linkType === "collection" && collection
              ? `/${locale}/search?${new URLSearchParams({ collectionId: collection.id })}`
              : undefined;
    return {
      id: item.id,
      label,
      href,
      target: item.target === "_blank" ? "_blank" : "_self",
      placeholder: !href,
      presentation,
      image: images.find((image) => image.id === presentation.mediaId),
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
  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const pages = await getPublishedPages();
  const page = pages.find((candidate) => {
    const slugs = candidate.slugI18n as Localized;
    return (
      slugs[locale] === decodedSlug &&
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
