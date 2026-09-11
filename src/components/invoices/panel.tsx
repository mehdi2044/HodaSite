import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { getTranslations } from "next-intl/server";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { generateInvoiceAction } from "@/app/admin/(dashboard)/settings/invoices/actions";
/** Parent page has already authorized this order. Downloads authorize again. */
export async function InvoicePanel({
  orderId,
  number,
  marketId,
  paidAt,
  adminId,
}: {
  orderId: string;
  number: string;
  marketId: string;
  paidAt: Date | null;
  adminId?: string;
}) {
  if (!paidAt) return null;
  if (adminId && !(await can(adminId, "order.invoice.view", { marketId })))
    return null;
  const invoices = await db.invoice.findMany({
    where: { orderId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true },
  });
  const t = await getTranslations("invoice");
  const editable = adminId && (await can(adminId, "order.edit", { marketId }));
  return (
    <section
      className="grid gap-4 rounded-token border border-black/10 bg-surface p-6"
      data-testid="invoice-panel"
    >
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {invoices.length === 0 && <p className="text-muted">{t("empty")}</p>}
      {invoices.map((invoice) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3"
          key={invoice.id}
        >
          <span>
            {t("version")} {invoice.version}
          </span>
          {invoice.status === "READY" ? (
            <a
              className="button"
              href={`/api/orders/${encodeURIComponent(number)}/invoices/${invoice.id}`}
            >
              {t("download")}
            </a>
          ) : (
            <p role="status" className="text-muted">
              {t(invoice.status === "FAILED" ? "failed" : "pending")}
            </p>
          )}
        </div>
      ))}
      {editable && (
        <CommerceForm
          action={generateInvoiceAction}
          key={invoices[0]?.version ?? 0}
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input
            type="hidden"
            name="version"
            value={invoices[0]?.version ?? 0}
          />
          <button className="button justify-self-start">{t("generate")}</button>
        </CommerceForm>
      )}
    </section>
  );
}
