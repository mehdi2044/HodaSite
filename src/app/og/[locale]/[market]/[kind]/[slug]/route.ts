import { normalizeThemeColors, safeColorMap } from "@/lib/theme-validation";
import { DEFAULT_LIGHT_COLORS } from "@/lib/theme-defaults";
import sharp from "sharp";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSiteSettings, getThemeSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";
import { localized, xmlEscape } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      locale: string;
      market: string;
      kind: string;
      slug: string;
    }>;
  },
) {
  const parsed = z
    .object({
      locale: z.enum(["fa", "tr", "en"]),
      market: z.string().max(40),
      kind: z.enum(["home", "p", "c", "pages"]),
      slug: z.string().max(500),
    })
    .safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const { locale, market: code, kind, slug } = parsed.data;
  const market = await db.market.findFirst({
    where: { code, isActive: true, enabledLocales: { has: locale } },
    select: { id: true },
  });
  if (!market) return new Response(null, { status: 404 });
  const colors = safeColorMap(
    normalizeThemeColors((await getThemeSettings())?.colors).light,
    DEFAULT_LIGHT_COLORS,
  );
  const brand = normalizeBrand((await getSiteSettings())?.brand),
    name = brand.name[locale] || brand.name.fa;
  let title = name;
  if (kind !== "home") {
    const common = {
      deletedAt: null,
      slugI18n: { path: [locale], equals: slug },
    };
    const item =
      kind === "p"
        ? await db.product.findFirst({
            where: {
              ...common,
              status: "ACTIVE",
              marketIds: { has: market.id },
            },
            select: { titleI18n: true },
          })
        : kind === "c"
          ? await db.category.findFirst({
              where: common,
              select: { titleI18n: true },
            })
          : await db.page.findFirst({
              where: {
                ...common,
                status: "published",
                OR: [
                  { marketIds: { isEmpty: true } },
                  { marketIds: { has: market.id } },
                ],
              },
              select: { titleI18n: true },
            });
    if (!item) return new Response(null, { status: 404 });
    title = localized(item.titleI18n, locale);
  }
  // libvips/Pango shapes RTL and uses the vendored licensed font. No remote font/image requests.
  const fontfile = path.join(
    process.cwd(),
    "public/fonts",
    locale === "fa"
      ? "vazirmatn/vazirmatn-arabic-wght-normal.woff2"
      : "inter/inter-latin-ext-wght-normal.woff2",
  );
  const text = async (
    value: string,
    size: number,
    width: number,
    height: number,
  ) =>
    sharp({
      text: {
        text: `<span foreground="${colors.text}">${xmlEscape(value.slice(0, 100) || " ")}</span>`,
        font: locale === "fa" ? `Vazirmatn ${size}` : `Inter ${size}`,
        fontfile,
        rgba: true,
        width,
        height,
        align: locale === "fa" ? "right" : "left",
      },
    })
      .png()
      .toBuffer();
  const [brandText, titleText] = await Promise.all([
    text(name, 30, 1040, 80),
    text(title, 64, 1040, 230),
  ]);
  const png = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: colors.background,
    },
  })
    .composite([
      { input: brandText, left: 80, top: 65 },
      { input: titleText, left: 80, top: 240 },
    ])
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
