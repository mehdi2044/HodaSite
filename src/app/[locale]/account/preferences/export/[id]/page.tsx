import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { exportPersonalData } from "@/modules/crm";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
export const dynamic = "force-dynamic";
export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, id } = await params,
    t = await getTranslations("crm"),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .catch(0)
      .parse((await searchParams).page);
  try {
    const data = await exportPersonalData(id, page);
    return (
      <main className="shell py-10 grid gap-5">
        <Link className="underline" href={`/${locale}/account/preferences`}>
          {t("preferences")}
        </Link>
        <h1>{t("download")}</h1>
        <p>{t("exportHelp")}</p>
        <a className="button w-fit" href={`/api/crm/export/${id}?page=${page}`}>
          {t("downloadPage", { page: page + 1 })}
        </a>
        <div className="flex gap-3">
          {page > 0 && (
            <Link className="button" href={`?page=${page - 1}`}>
              {t("previous")}
            </Link>
          )}
          {data.pagination.nextPage !== null && (
            <Link className="button" href={`?page=${data.pagination.nextPage}`}>
              {t("next")}
            </Link>
          )}
        </div>
      </main>
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect(`/${locale}/account/login`);
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}
