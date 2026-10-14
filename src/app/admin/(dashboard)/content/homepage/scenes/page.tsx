import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import {
  homepageRevisionHistory,
  REVISION_FORMAT,
} from "@/modules/content/publication";
import { SceneEditor } from "@/components/admin/scene-editor";
import {
  saveSceneDraft,
  publishSceneRevision,
  scheduleSceneRevision,
} from "./actions";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function ScenesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; revision?: string; after?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const userId = session.user.id;
  const [query, locale, t, markets, globalRead] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("scenes"),
    db.market.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    can(userId, "content.homepage.read"),
  ]);
  const rights = await Promise.all(
    markets.map((market) =>
      can(userId, "content.homepage.read", { marketId: market.id }),
    ),
  );
  const allowed = markets.filter((_, n) => rights[n]);
  if (!globalRead && !allowed.length) notFound();
  const selected = query.scope ?? (globalRead ? "global" : allowed[0].id);
  if (selected !== "global" && !allowed.some((m) => m.id === selected))
    notFound();
  if (selected === "global" && !globalRead) notFound();
  const marketId = selected === "global" ? null : selected;
  const [row, global, writable] = await Promise.all([
    db.homepage.findFirst({ where: { marketId, deletedAt: null } }),
    db.homepage.findFirst({
      where: { marketId: null, deletedAt: null, isPublished: true },
    }),
    can(userId, "content.homepage.write", marketId ? { marketId } : undefined),
  ]);
  let viewedRevision: { id: string; at: string; version: number } | null = null;
  let revisionBlocks: unknown;
  if (query.revision) {
    if (
      !row ||
      typeof query.revision !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(query.revision)
    )
      notFound();
    const revision = await db.auditLog.findFirst({
      where: {
        id: query.revision,
        entityType: "Homepage",
        entityId: row.id,
        action: "content.homepage.revision",
      },
    });
    const snapshot = revision?.after as {
      format?: unknown;
      blocks?: unknown;
      version?: unknown;
    } | null;
    if (
      !revision ||
      snapshot?.format !== REVISION_FORMAT ||
      typeof snapshot.version !== "number" ||
      !Number.isInteger(snapshot.version)
    )
      notFound();
    revisionBlocks = snapshot.blocks;
    viewedRevision = {
      id: revision.id,
      at: revision.createdAt.toISOString(),
      version: snapshot.version,
    };
  }
  const parsed = homepageBlocksSchema.safeParse(
    revisionBlocks ?? row?.draftBlocks ?? row?.blocks ?? global?.blocks ?? [],
  );
  if (viewedRevision && !parsed.success) notFound();
  const productMarket = marketId ? { has: marketId } : undefined;
  const [products, history] = await Promise.all([
    db.product.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        category: { deletedAt: null },
        coinPackCoins: null,
        ...(productMarket ? { marketIds: productMarket } : {}),
      },
      select: {
        id: true,
        titleI18n: true,
        media: {
          where: { media: { kind: "image", status: "READY", deletedAt: null } },
          select: {
            media: { select: { id: true, url: true, originalName: true } },
          },
        },
        variants: {
          where: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
          select: {
            id: true,
            color: { select: { id: true, nameI18n: true } },
            size: { select: { value: true } },
            media: {
              where: {
                media: { kind: "image", status: "READY", deletedAt: null },
              },
              select: {
                media: { select: { id: true, url: true, originalName: true } },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    row ? homepageRevisionHistory(userId, row.id, query.after) : [],
  ]);
  const blocks = parsed.success ? parsed.data : [];
  const ids = blocks.flatMap((block) => [
    ...("scene" in block && block.scene
      ? [block.scene.desktop.mediaId, block.scene.mobile.mediaId]
      : []),
    ...((block.type === "Hero" || block.type === "Banner") && block.mediaId
      ? [block.mediaId]
      : []),
  ]);
  const images = await db.media.findMany({
    where: { id: { in: ids }, kind: "image", status: "READY", deletedAt: null },
    select: { id: true, url: true },
  });
  const name = (value: unknown) => {
    const titles = value as Record<string, string>;
    return titles[locale] || titles.en || titles.fa || "";
  };
  const productOptions = products.map((product) => {
    const colorIds = [...new Set(product.variants.map((v) => v.color.id))];
    return {
      id: product.id,
      title: name(product.titleI18n),
      colors: colorIds.map((colorId) => {
        const variants = product.variants.filter((v) => v.color.id === colorId);
        const own = [
          ...new Map(
            variants.flatMap((v) =>
              v.media.map((m) => [m.media.id, m.media] as const),
            ),
          ).values(),
        ];
        return {
          id: colorId,
          title: name(variants[0].color.nameI18n),
          images: own.length
            ? own
            : colorIds.length === 1
              ? product.media.map((m) => m.media)
              : [],
          variants: variants.map((v) => ({ id: v.id, size: v.size.value })),
        };
      }),
    };
  });
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("editorTitle")}</h1>
      <p className="text-muted mt-2">{t("editorIntro")}</p>
      <SceneEditor
        initialBlocks={blocks}
        viewedRevision={viewedRevision}
        version={row?.version ?? 0}
        homepageId={row?.id ?? null}
        draftRevisionId={row?.draftRevisionId ?? null}
        publishedRevisionId={row?.publishedRevisionId ?? null}
        schedule={
          row?.scheduledAt
            ? { at: row.scheduledAt.toISOString(), error: row.scheduleError }
            : null
        }
        scope={selected}
        globalAllowed={globalRead}
        markets={allowed.map((m) => ({
          id: m.id,
          code: m.code,
          enabledLocales: m.enabledLocales,
        }))}
        products={productOptions}
        imageUrls={Object.fromEntries(images.map((m) => [m.id, m.url]))}
        history={history.map((revision) => ({
          id: revision.id,
          at: revision.createdAt.toISOString(),
          version:
            (revision.after as { version?: number } | null)?.version ?? 0,
        }))}
        hasMoreHistory={history.length === 50}
        seed={randomUUID()}
        writable={writable}
        action={saveSceneDraft}
        publish={publishSceneRevision}
        scheduleAction={scheduleSceneRevision}
      />
    </>
  );
}
