import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import { HomepageBuilder } from "@/components/admin/homepage-builder";
import { saveHomepage } from "./actions";

export default async function HomepageAdmin() {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "content.homepage.read"))
  )
    redirect("/admin");
  const t = await getTranslations("homepageAdmin");
  const [rows, markets] = await Promise.all([
    db.homepage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    db.market.findMany({ orderBy: { code: "asc" } }),
  ]);
  const compositions = Object.fromEntries(
    rows.map((row) => {
      const parsed = homepageBlocksSchema.safeParse(row.blocks);
      return [row.marketId ?? "global", parsed.success ? parsed.data : []];
    }),
  );
  const ids = [
    ...new Set(
      rows.flatMap((row) => {
        const parsed = homepageBlocksSchema.safeParse(row.blocks);
        return parsed.success
          ? parsed.data.flatMap((block) =>
              (block.type === "Hero" || block.type === "Banner") &&
              block.mediaId
                ? [block.mediaId]
                : [],
            )
          : [];
      }),
    ),
  ];
  const media = ids.length
    ? await db.media.findMany({
        where: { id: { in: ids }, kind: "image", deletedAt: null },
        select: { id: true, storageKey: true },
      })
    : [];
  return (
    <HomepageBuilder
      action={saveHomepage}
      compositions={compositions}
      mediaUrls={Object.fromEntries(
        media.map((item) => [item.id, `/media/${item.storageKey}`]),
      )}
      markets={markets.map((market) => ({ id: market.id, code: market.code }))}
      labels={{
        title: t("title"),
        description: t("description"),
        global: t("global"),
        market: t("market"),
        add: t("add"),
        save: t("save"),
        preview: t("preview"),
        mobile: t("mobile"),
        desktop: t("desktop"),
        moveUp: t("moveUp"),
        moveDown: t("moveDown"),
        remove: t("remove"),
        empty: t("empty"),
        phase2: t("phase2"),
        selectImage: t("selectImage"),
        fieldTitle: t("fieldTitle"),
        body: t("body"),
        ctaLabel: t("ctaLabel"),
        ctaUrl: t("ctaUrl"),
        source: t("source"),
      }}
    />
  );
}
