import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { reviewDrafts } from "@/modules/ai/products";
import { proposalSchema } from "@/modules/ai/proposals";
import { AiReviewQueue } from "@/components/admin/ai-review";
import { AiBulk } from "@/components/admin/ai-bulk";
export default async function Page() {
  const drafts = await reviewDrafts(),
    t = await getTranslations("aiAdmin"),
    locale = await getLocale();
  const products = await db.product.findMany({
    where: { status: "DRAFT", deletedAt: null },
    select: { id: true, titleI18n: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const categories = await db.category.findMany({
    where: { deletedAt: null },
    select: { id: true, titleI18n: true },
    take: 200,
  });
  const options = categories.map((c) => ({
    id: c.id,
    label: String((c.titleI18n as Record<string, string>)[locale] ?? c.id),
  }));
  return (
    <div className="grid max-w-5xl gap-6">
      <h1 className="text-2xl font-semibold">{t("queue")}</h1>
      <AiBulk
        products={products.map((p) => ({
          id: p.id,
          title: String(
            (p.titleI18n as Record<string, string>)[locale] ?? p.id,
          ),
        }))}
      />
      <p className="text-sm text-muted">{t("queueHelp")}</p>
      <AiReviewQueue
        drafts={drafts.map((d) => ({
          id: d.id,
          productId: d.productId,
          proposal: proposalSchema.parse(d.proposal),
        }))}
        categories={options}
      />
    </div>
  );
}
