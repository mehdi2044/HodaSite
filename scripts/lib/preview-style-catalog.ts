import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { Prisma, type PrismaClient } from "@prisma/client";
import { evaluateAccess } from "../../src/modules/access";
import type { StorageProvider } from "../../src/modules/integrations/storage";
import { styleProducts } from "../../prisma/style-products";
import {
  departmentStyleComposition,
  previousStyleComposition,
} from "../../prisma/style-seed";
import {
  legacyHomepageBlocks,
  spatialCampaignTitle,
} from "../../prisma/demo-homepage";
import { hasCompleteStyleCatalog } from "../style-demo-catalog";
import { buildProductSearchText } from "../catalog-search";

export class PreviewImportError extends Error {}

const departments = ["women", "men", "kids", "accessories"] as const;
const looks = ["look-women-coat", "look-women-knit", "look-men", "look-kids"];
const idOf = (key: string) => `seed-style-v2-${key}`;
const mediaId = (key: string) => `seed-fashion-v2-${key}`;
const texts = (fa: string, tr: string, en: string) => ({ fa, tr, en });
const colors: Record<string, [string, ReturnType<typeof texts>]> = {
  IVORY: ["#F1EBDC", texts("شیری", "Ekru", "Ivory")],
  CHARCOAL: ["#40413D", texts("ذغالی", "Antrasit", "Charcoal")],
  FOREST: ["#3E5240", texts("سبز جنگلی", "Orman yeşili", "Forest")],
  SAGE: ["#9BA78B", texts("سبز مریم‌گلی", "Adaçayı", "Sage")],
  LILAC: ["#B49BC2", texts("یاسی", "Lila", "Lilac")],
  COGNAC: ["#9D542E", texts("عسلی", "Taba", "Cognac")],
  MULTI: ["#A45135", texts("چندرنگ", "Çok renkli", "Multicolor")],
  SAND: ["#C8A77A", texts("شنی", "Kum", "Sand")],
  RUST: ["#A45135", texts("آجری", "Kiremit", "Rust")],
  NAVY: ["#1B3155", texts("سرمه‌ای", "Lacivert", "Navy")],
};

type Reader = Pick<
  Prisma.TransactionClient,
  | "user"
  | "siteSettings"
  | "market"
  | "category"
  | "product"
  | "media"
  | "homepage"
  | "warehouse"
>;

function isKnownHomepage(blocks: Prisma.JsonValue) {
  const spatial = legacyHomepageBlocks.map((block, index) =>
    index === 0
      ? {
          ...block,
          mediaId: "seed-fashion-v1-coat",
          ctaUrl: "/search",
          layout: "spatial",
          title: spatialCampaignTitle,
        }
      : block,
  );
  return (
    isDeepStrictEqual(blocks, spatial) ||
    isDeepStrictEqual(blocks, previousStyleComposition())
  );
}

/** Read-only plan. No defaults are silently applied to a merchant's settings. */
export async function planPreviewStyleCatalog(db: Reader, actorId: string) {
  const [actor, settings, markets, roots, products, home, warehouse] =
    await Promise.all([
      db.user.findUnique({
        where: { id: actorId },
        select: {
          isActive: true,
          overrides: { orderBy: { id: "asc" } },
          roles: {
            orderBy: { id: "asc" },
            include: {
              role: { include: { permissions: { orderBy: { id: "asc" } } } },
            },
          },
        },
      }),
      db.siteSettings.findUnique({ where: { id: "default" } }),
      db.market.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
      db.category.findMany({
        where: { id: { in: departments.map((d) => `seed-category-${d}`) } },
        include: { media: true },
        orderBy: { id: "asc" },
      }),
      db.product.findMany({
        where: { id: { in: styleProducts.map(([key]) => idOf(key)) } },
        orderBy: { id: "asc" },
      }),
      db.homepage.findUnique({ where: { id: "seed-homepage-global" } }),
      db.warehouse.findUnique({ where: { id: "seed-warehouse-istanbul" } }),
    ]);
  if (
    !actor?.roles.some(
      (r) =>
        r.role.key === "owner" &&
        (r.scope === null || isDeepStrictEqual(r.scope, {})),
    ) ||
    [
      "catalog.product.create",
      "catalog.product.edit",
      "pricing.sale_price.edit",
      "inventory.receive",
      "catalog.product.publish",
      "media.upload",
      "content.homepage.write",
    ].some(
      (p) =>
        !evaluateAccess(actor, p) ||
        markets.some((m) =>
          roots.some(
            (r) =>
              !evaluateAccess(actor, p, { marketId: m.id, categoryId: r.id }),
          ),
        ),
    )
  )
    throw new PreviewImportError(
      "An active, unrestricted owner with catalog, stock and homepage permissions is required.",
    );
  const finance = settings?.finance as Record<string, unknown> | undefined;
  if (finance?.pricingBaseCurrency !== "USD" || !markets.length)
    throw new PreviewImportError(
      "The existing demo requires USD base pricing and at least one active market; no settings were changed.",
    );
  if (
    !warehouse?.isActive ||
    roots.length !== 4 ||
    roots.some(
      (r) =>
        r.deletedAt ||
        r.parentId ||
        r.media?.kind !== "image" ||
        r.media.status !== "READY" ||
        r.media.deletedAt,
    )
  )
    throw new PreviewImportError(
      "The four existing root categories need live cover images and the demo warehouse must be active.",
    );
  const existing = new Set(products.map((p) => p.id));
  // A soft-deleted or merchant-edited sample is deliberately not recreated.
  const missing = styleProducts
    .filter(([key]) => !existing.has(idOf(key)))
    .map(([key]) => key);
  const collisions = missing.length
    ? await db.product.count({
        where: {
          id: { notIn: styleProducts.map(([key]) => idOf(key)) },
          OR: missing.flatMap((key) => [
            { slugI18n: { path: ["fa"], equals: `نمونه-${key}` } },
            { slugI18n: { path: ["tr"], equals: `demo-${key}` } },
            { slugI18n: { path: ["en"], equals: `demo-${key}` } },
          ]),
        },
      })
    : 0;
  if (collisions)
    throw new PreviewImportError(
      "A demo slug belongs to another product; no existing product will be replaced.",
    );
  const upgradeHomepage =
    !!home &&
    !home.deletedAt &&
    home.marketId === null &&
    isKnownHomepage(home.blocks);
  const assetKeys = [...missing, ...(upgradeHomepage ? looks : [])];
  const media = await db.media.findMany({
    where: { id: { in: assetKeys.map(mediaId) } },
    orderBy: { id: "asc" },
  });
  if (
    media.some((m) => m.deletedAt || m.status !== "READY" || m.kind !== "image")
  )
    throw new PreviewImportError(
      "A retained demo image is unavailable. Restore or replace it explicitly; this import will not overwrite it.",
    );
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        actor,
        settings,
        markets,
        roots,
        products,
        home,
        warehouse,
        media,
      }),
    )
    .digest("hex");
  return {
    digest,
    missing,
    retained: products.length,
    assetKeys: assetKeys.filter(
      (key) => !media.some((m) => m.id === mediaId(key)),
    ),
    upgradeHomepage,
    marketIds: markets.map((m) => m.id),
    warehouseId: warehouse.id,
  };
}

type Plan = Awaited<ReturnType<typeof planPreviewStyleCatalog>>;
type Prepared = { data: Prisma.MediaCreateInput; keys: string[] };

async function prepareImage(
  key: string,
  store: StorageProvider,
): Promise<Prepared> {
  const source = await readFile(
    path.join(process.cwd(), "prisma/demo-assets/v2", `${key}.webp`),
  );
  const meta = await sharp(source).metadata();
  const prefix = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}`;
  const keys: string[] = [];
  const variants: Record<string, { key: string; url: string; bytes: number }> =
    {};
  for (const width of [320, 640, 960]) {
    const bytes = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const objectKey = `${prefix}-${width}.webp`;
    const url = await store.put(objectKey, bytes, "image/webp");
    keys.push(objectKey);
    variants[String(width)] = { key: objectKey, url, bytes: bytes.length };
  }
  const storageKey = `${prefix}.webp`;
  const url = await store.put(storageKey, source, "image/webp");
  keys.push(storageKey);
  const blur = await sharp(source).resize(16).webp({ quality: 40 }).toBuffer();
  return {
    keys,
    data: {
      id: mediaId(key),
      kind: "image",
      status: "READY",
      storageKey,
      url,
      originalName: `demo-fashion-v2-${key}.webp`,
      mime: "image/webp",
      bytes: source.length,
      width: meta.width,
      height: meta.height,
      variants: { webp: variants },
      blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
      altI18n: texts(
        "تصویر نمایشی هوش مصنوعی",
        "Yapay zekâ örnek görseli",
        "AI demo image",
      ),
      tags: ["demo", "ai-generated"],
    },
  };
}

/** Additive preview import. Existing products, stock, prices, users and orders are never updated. */
export async function applyPreviewStyleCatalog(
  db: PrismaClient,
  store: StorageProvider,
  actorId: string,
  expected: Plan,
) {
  const initial = await planPreviewStyleCatalog(db, actorId);
  if (initial.digest !== expected.digest)
    throw new PreviewImportError(
      "Preview changed after planning; run the read-only plan again.",
    );
  const prepared: Prepared[] = [];
  for (const key of initial.assetKeys)
    prepared.push(await prepareImage(key, store));
  // File keys are fresh UUIDs. On uncertain commit/storage failure they are retained,
  // never deleted or overwritten; rerunning still cannot duplicate catalog/stock rows.
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('hoda:preview-style-import'))::text`;
      const current = await planPreviewStyleCatalog(tx, actorId);
      if (current.digest !== initial.digest)
        throw new PreviewImportError(
          "Preview changed during image preparation; no catalog changes committed.",
        );
      for (const item of prepared) await tx.media.create({ data: item.data });
      let variantsAdded = 0;
      if (current.missing.length) {
        const brand = await tx.brand.findUnique({ where: { slug: "atelier" } });
        if (brand?.deletedAt)
          throw new PreviewImportError(
            "The demo brand is archived; it will not be restored automatically.",
          );
        const brandId =
          brand?.id ??
          (
            await tx.brand.create({
              data: {
                id: "seed-brand-atelier",
                slug: "atelier",
                nameI18n: texts("آتلیه", "Atölye", "Atelier"),
              },
            })
          ).id;
        for (const [key, section, color, price, title] of styleProducts) {
          if (!current.missing.includes(key)) continue;
          const department = key.split("-")[0];
          const root = `seed-category-${department}`;
          const existingColor = await tx.color.findUnique({
            where: { code: color },
          });
          if (existingColor?.deletedAt)
            throw new PreviewImportError(
              "A required color is archived; merchant choices were preserved.",
            );
          const colorId =
            existingColor?.id ??
            (
              await tx.color.create({
                data: {
                  id: `seed-color-${color.toLowerCase()}`,
                  code: color,
                  hex: colors[color][0],
                  nameI18n: colors[color][1],
                },
              })
            ).id;
          await tx.product.create({
            data: {
              id: idOf(key),
              categoryId: root,
              brandId,
              fittingSlot:
                section === "tops"
                  ? "TOP"
                  : section === "bottoms"
                    ? "BOTTOM"
                    : section === "outerwear"
                      ? "LAYER"
                      : section === "one-pieces"
                        ? "ONE_PIECE"
                        : "ACCESSORY",
              gender:
                department === "women"
                  ? "WOMEN"
                  : department === "men"
                    ? "MEN"
                    : department === "kids"
                      ? "KIDS"
                      : "UNISEX",
              titleI18n: title,
              slugI18n: texts(`نمونه-${key}`, `demo-${key}`, `demo-${key}`),
              descriptionI18n: texts(
                "محصول فرضی برای پیش‌نمایش؛ تصویر و قیمت نمایشی است.",
                "Önizleme için kurgusal ürün; görsel ve fiyat örnektir.",
                "Fictional preview product; image and price are illustrative.",
              ),
              tags: ["seed", "style-v2", "demo"],
              status: "ACTIVE",
              basePriceAmount: price,
              basePriceCurrency: "USD",
              marketIds: current.marketIds,
              searchText: buildProductSearchText([
                title.fa,
                title.tr,
                title.en,
                `${key} demo`,
              ]),
              media: { create: { mediaId: mediaId(key), sortOrder: 0 } },
            },
          });
          const values =
            department === "kids"
              ? ["4Y", "6Y", "8Y"]
              : department === "accessories"
                ? ["ONE SIZE"]
                : ["S", "M", "L"];
          for (const [sortOrder, value] of values.entries()) {
            const groupKey =
              department === "kids"
                ? "kids-age"
                : department === "accessories"
                  ? "accessories"
                  : "apparel";
            const scale = department === "kids" ? "CA" : "INTL";
            const retainedSize = await tx.size.findUnique({
              where: { scale_value_groupKey: { scale, value, groupKey } },
            });
            if (retainedSize?.deletedAt)
              throw new PreviewImportError(
                "A required size is archived; merchant choices were preserved.",
              );
            const size =
              retainedSize ??
              (await tx.size.create({
                data: { scale, value, groupKey, sortOrder },
              }));
            const variantId = `${idOf(key)}-${value.replace(/\s/g, "-").toLowerCase()}`;
            await tx.variant.create({
              data: {
                id: variantId,
                productId: idOf(key),
                colorId,
                sizeId: size.id,
                isActive: true,
                sku: `STYLE-V2-${key.toUpperCase()}-${value.replace(/\s/g, "-")}`,
              },
            });
            const stock = await tx.stockItem.create({
              data: {
                variantId,
                warehouseId: current.warehouseId,
                onHand: 10,
                lowStockThreshold: 2,
              },
            });
            const lot = await tx.lot.create({
              data: {
                warehouseId: current.warehouseId,
                variantId,
                qtyReceived: 10,
                qtyRemaining: 10,
                unitCostAmount: "0",
                unitCostCurrency: "USD",
                unitCostAmountTry: "0",
                unitCostAmountUsd: "0",
                fxRateSnapshot: { demo: true },
                receivedAt: new Date(),
              },
            });
            await tx.stockMovement.create({
              data: {
                stockItemId: stock.id,
                warehouseId: current.warehouseId,
                variantId,
                lotId: lot.id,
                type: "IN",
                quantity: 10,
                reason: "preview-style-demo-import",
                createdBy: actorId,
              },
            });
            variantsAdded++;
          }
        }
      }
      let homepage = "preserved";
      if (current.upgradeHomepage && (await hasCompleteStyleCatalog(tx))) {
        const home = await tx.homepage.findUniqueOrThrow({
          where: { id: "seed-homepage-global" },
        });
        const blocks = departmentStyleComposition();
        // Owner-approved hero is preserved byte-for-byte, including its copy/layout/image.
        blocks[0] = (home.blocks as Prisma.InputJsonObject[])[0];
        // Shared color codes can have merchant-owned IDs. Resolve the actual
        // eligible variant instead of writing seed IDs into prepared-look links.
        const lookBlock = blocks.find((block) => block.type === "ShopLook");
        if (lookBlock && Array.isArray(lookBlock.looks)) {
          const eligible = [];
          for (const look of lookBlock.looks as Prisma.InputJsonObject[]) {
            const items = [];
            for (const item of look.items as {
              productId: string;
              colorId: string;
            }[]) {
              const variant = await tx.variant.findFirst({
                where: {
                  productId: item.productId,
                  isActive: true,
                  product: {
                    deletedAt: null,
                    status: "ACTIVE",
                    coinPackCoins: null,
                  },
                  color: {
                    code: item.colorId.replace("seed-color-", "").toUpperCase(),
                    deletedAt: null,
                  },
                  size: { deletedAt: null },
                },
                select: { colorId: true },
              });
              if (variant)
                items.push({
                  productId: item.productId,
                  colorId: variant.colorId,
                });
            }
            if (items.length === (look.items as unknown[]).length)
              eligible.push({ ...look, items });
          }
          blocks[blocks.indexOf(lookBlock)] = { ...lookBlock, looks: eligible };
          if (!eligible.length)
            blocks.splice(
              blocks.findIndex((block) => block.type === "ShopLook"),
              1,
            );
        }
        await tx.homepage.update({ where: { id: home.id }, data: { blocks } });
        homepage = "upgraded";
      }
      if (current.missing.length || prepared.length || homepage === "upgraded")
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "preview.style.import",
            entityType: "Homepage",
            entityId: "seed-homepage-global",
            after: {
              productsAdded: current.missing,
              variantsAdded,
              homepage,
              plan: initial.digest,
            },
          },
        });
      return {
        productsAdded: current.missing.length,
        retained: current.retained,
        variantsAdded,
        homepage,
      };
    },
    { isolationLevel: "Serializable", timeout: 60_000 },
  );
}

export function requireLocalPreview(env: NodeJS.ProcessEnv) {
  let hostname = "";
  try {
    hostname = new URL(env.APP_URL ?? "").hostname;
  } catch {
    /* rejected below */
  }
  if (
    env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  )
    throw new PreviewImportError(
      "Demo imports are restricted to a local development preview.",
    );
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new PreviewImportError("A local preview PostgreSQL URL is required.");
  }
  // `postgres` is the database service in the verified development Compose
  // project. A loopback storefront URL must never authorize a hosted database.
  const queryOptions = new Set([
    "schema",
    "connection_limit",
    "pool_timeout",
    "connect_timeout",
    "socket_timeout",
  ]);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1", "[::1]", "postgres"].includes(
      database.hostname,
    ) ||
    database.pathname.length < 2 ||
    [...database.searchParams.keys()].some((key) => !queryOptions.has(key))
  )
    throw new PreviewImportError(
      "The database must use loopback or the local Compose postgres service, without routing overrides.",
    );
  const mediaRoot = env.MEDIA_DIR ?? "/data/media";
  if (
    ![undefined, "local"].includes(env.STORAGE_PROVIDER) ||
    !(path.posix.isAbsolute(mediaRoot) || path.win32.isAbsolute(mediaRoot)) ||
    /^(?:\\\\|\/\/)/.test(mediaRoot) ||
    mediaRoot.includes("://")
  )
    throw new PreviewImportError(
      "Preview imports require local filesystem storage with an absolute local media directory; remote storage is not supported.",
    );
}
