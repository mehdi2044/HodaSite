import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { shippingMarkets } from "@/modules/shipping/workflows";
import {
  WorkflowEditor,
  type EditableWorkflow,
} from "@/components/shipping/workflow-editor";
export default async function ShippingSettings() {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/admin/login");
  const markets = await shippingMarkets(userId);
  if (!markets.length) notFound();
  const workflows = await db.shippingWorkflow.findMany({
    where: { marketId: { in: markets.map((m) => m.id) } },
    include: { legs: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const t = await getTranslations("shipping");
  return (
    <div className="grid gap-5">
      <h1>{t("settings")}</h1>
      <p className="text-muted">{t("workflowHint")}</p>
      {workflows.map((w) => (
        <details className="card" key={w.id}>
          <summary className="cursor-pointer font-semibold">
            {markets.find((m) => m.id === w.marketId)?.code} ·{" "}
            {(w.nameI18n as { fa: string }).fa}{" "}
            {w.isDefault ? `— ${t("default")}` : ""}
          </summary>
          <WorkflowEditor
            workflow={{
              ...w,
              nameI18n: w.nameI18n as EditableWorkflow["nameI18n"],
              legs: w.legs.map((l) => ({
                ...l,
                labelI18n: l.labelI18n as EditableWorkflow["nameI18n"],
              })),
            }}
            markets={markets}
          />
        </details>
      ))}
      <details className="card">
        <summary className="cursor-pointer font-semibold">
          {t("newWorkflow")}
        </summary>
        <WorkflowEditor markets={markets} />
      </details>
    </div>
  );
}
