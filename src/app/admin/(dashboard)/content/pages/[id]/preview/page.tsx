import { notFound, redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { pageBlocksSchema, type Localized } from "@/modules/content";
import { ContentBlocks } from "@/components/storefront/content-blocks";
import { getTranslations } from "next-intl/server";

export default async function DraftPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ viewport?: string; locale?: string }>;
}) {
  const t = await getTranslations("contentAdmin");
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "content.page.read")))
    redirect("/admin/login");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = await db.page.findFirst({ where: { id, deletedAt: null } });
  if (!page) notFound();
  const blocks = pageBlocksSchema.safeParse(page.blocks);
  if (!blocks.success) notFound();
  const locale = (
    ["fa", "tr", "en"].includes(query.locale ?? "fa") ? query.locale : "fa"
  ) as "fa" | "tr" | "en";
  const width = query.viewport === "mobile" ? "390px" : "1280px";
  const title = (page.titleI18n as Localized)[locale] || "";
  return (
    <main
      className="mx-auto min-h-screen bg-bg p-6"
      style={{ maxWidth: width }}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <p className="mb-4 text-sm text-warning">{t("privatePreview")}</p>
      <h1 className="mb-8 text-4xl">{title}</h1>
      <ContentBlocks blocks={blocks.data} locale={locale} />
    </main>
  );
}
