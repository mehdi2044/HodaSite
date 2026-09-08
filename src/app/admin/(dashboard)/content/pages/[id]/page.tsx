import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { savePage } from "../actions";
import { getTranslations } from "next-intl/server";
import { PageBlocksEditor } from "@/components/admin/page-blocks-editor";
import { pageBlocksSchema } from "@/modules/content";

const emptyLocalized = { fa: "", tr: "", en: "" };

export default async function PageEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("contentAdmin");
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "content.page.read")))
    redirect("/admin");
  const { id } = await params;
  const [page, markets] = await Promise.all([
    id === "new" ? null : db.page.findFirst({ where: { id, deletedAt: null } }),
    db.market.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (id !== "new" && !page) notFound();
  const title =
    (page?.titleI18n as typeof emptyLocalized | undefined) ?? emptyLocalized;
  const slug =
    (page?.slugI18n as typeof emptyLocalized | undefined) ?? emptyLocalized;
  const seo =
    (page?.seoI18n as
      | { title?: typeof emptyLocalized; description?: typeof emptyLocalized }
      | undefined) ?? {};
  const parsedBlocks = pageBlocksSchema.safeParse(page?.blocks ?? []);
  const blocks = parsedBlocks.success ? parsedBlocks.data : [];
  const mediaIds = [
    ...new Set(
      blocks.flatMap((block) =>
        (block.type === "Image" || block.type === "Hero") && block.mediaId
          ? [block.mediaId]
          : [],
      ),
    ),
  ];
  const blockMedia = mediaIds.length
    ? await db.media.findMany({
        where: { id: { in: mediaIds }, kind: "image", deletedAt: null },
        select: { id: true, storageKey: true },
      })
    : [];
  const initialMediaUrls = Object.fromEntries(
    blockMedia.map((media) => [media.id, `/media/${media.storageKey}`]),
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {page ? t("editPage") : t("newPage")}
        </h1>
        {page && (
          <div className="flex gap-2">
            <Link
              className="button"
              target="_blank"
              href={`/admin/content/pages/${page.id}/preview?viewport=mobile`}
            >
              {t("previewMobile")}
            </Link>
            <Link
              className="button"
              target="_blank"
              href={`/admin/content/pages/${page.id}/preview?viewport=desktop`}
            >
              {t("previewDesktop")}
            </Link>
          </div>
        )}
      </div>
      <Card className="mt-5 max-w-none">
        <SettingsForm action={savePage} submitLabel={t("save")}>
          {page && <input type="hidden" name="id" value={page.id} />}
          {(["fa", "tr", "en"] as const).map((locale) => (
            <div key={locale} className="grid gap-2 md:grid-cols-2">
              <label>
                {t("title")} ({locale})
                <Input
                  name={`title${cap(locale)}`}
                  defaultValue={title[locale]}
                  required
                />
              </label>
              <label>
                {t("slug")} ({locale})
                <Input
                  name={`slug${cap(locale)}`}
                  defaultValue={slug[locale]}
                  dir="ltr"
                  required
                />
              </label>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-2">
            <label>
              {t("type")}
              <select
                name="type"
                className="input"
                defaultValue={page?.type ?? "static"}
              >
                <option value="static">{t("static")}</option>
                <option value="landing">{t("landing")}</option>
              </select>
            </label>
            <label>
              {t("status")}
              <select
                name="status"
                className="input"
                defaultValue={page?.status ?? "draft"}
              >
                <option value="draft">{t("draft")}</option>
                <option value="published">{t("published")}</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>{t("marketsAll")}</legend>
            {markets.map((market) => (
              <label key={market.id} className="ms-4">
                <input
                  type="checkbox"
                  name="marketIds"
                  value={market.id}
                  defaultChecked={page?.marketIds.includes(market.id)}
                />{" "}
                {market.code}
              </label>
            ))}
          </fieldset>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <div key={locale} className="grid gap-2 md:grid-cols-2">
              <label>
                {t("seoTitle")} ({locale})
                <Input
                  name={`seoTitle${cap(locale)}`}
                  defaultValue={seo.title?.[locale]}
                />
              </label>
              <label>
                {t("seoDescription")} ({locale})
                <Input
                  name={`seoDescription${cap(locale)}`}
                  defaultValue={seo.description?.[locale]}
                />
              </label>
            </div>
          ))}
          <PageBlocksEditor
            defaultValue={blocks}
            initialMediaUrls={initialMediaUrls}
          />
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}
