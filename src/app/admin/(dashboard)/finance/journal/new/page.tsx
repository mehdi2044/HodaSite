import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import { journalFormOptions } from "@/modules/finance/ledger-admin";
import { JournalForm } from "@/components/finance/journal-form";
export default async function NewJournalPage() {
  const t = await getTranslations("journal");
  let options: Awaited<ReturnType<typeof journalFormOptions>>;
  try {
    options = await journalFormOptions();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  return (
    <section className="finance-page">
      <p className="text-muted">{t("eyebrow")}</p>
      <h1>{t("new")}</h1>
      <p className="text-muted">{t("newHelp")}</p>
      <JournalForm
        options={options}
        requestKey={randomUUID()}
        today={new Date().toISOString().slice(0, 10)}
      />
    </section>
  );
}
