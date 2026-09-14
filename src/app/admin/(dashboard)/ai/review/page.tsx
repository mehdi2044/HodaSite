import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { reviewDrafts } from "@/modules/ai/products";
import { proposalSchema } from "@/modules/ai/proposals";
import { AiReview } from "@/components/admin/ai-review";
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
      {drafts.length === 0 && <p>{t("empty")}</p>}
      {drafts.map((d) => (
        <article key={d.id} className="grid gap-2">
          <a
            className="underline"
            href={`/admin/catalog/products/${d.productId}`}
          >
            {t("openProduct")}
          </a>
          <AiReview
            draftId={d.id}
            proposal={proposalSchema.parse(d.proposal)}
          />
        </article>
      ))}
    </div>
  );
}
