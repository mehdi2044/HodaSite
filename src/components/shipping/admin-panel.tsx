import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { shipmentInclude, shippingOrder } from "@/modules/shipping/service";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { shipmentAction } from "@/app/admin/(dashboard)/settings/shipping/actions";
import { transitions } from "@/modules/shipping/validation";
export async function ShippingPanel({
  orderId,
  userId,
}: {
  orderId: string;
  userId: string;
}) {
  const order = await shippingOrder(userId, orderId, "order.view");
  const manage = await can(userId, "order.shipment.manage", {
    marketId: order.marketId,
  });
  if (!manage) return null;
  const t = await getTranslations("shipping");
  const [shipments, items, workflows] = await Promise.all([
    db.shipment.findMany({
      where: { orderId },
      include: shipmentInclude,
      orderBy: { createdAt: "asc" },
    }),
    db.orderItem.findMany({ where: { orderId } }),
    db.shippingWorkflow.findMany({
      where: { marketId: order.marketId, isActive: true },
      orderBy: { isDefault: "desc" },
    }),
  ]);
  const editable =
    !!order.paidAt && ["PAID", "PROCESSING", "SHIPPED"].includes(order.status);
  const remaining = items.map((i) => ({
    ...i,
    remaining:
      i.quantity -
      shipments
        .filter((s) => s.status !== "CANCELLED")
        .flatMap((s) => s.items)
        .filter((row) => row.orderItemId === i.id)
        .reduce((n, row) => n + row.quantity, 0),
  }));
  const hidden = (
    shipmentId: string,
    version: number,
    operation: string,
    legId?: string,
  ) => (
    <>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="operation" value={operation} />
      {legId && <input type="hidden" name="legId" value={legId} />}
    </>
  );
  return (
    <section className="grid gap-5" data-testid="shipping-admin">
      <h2 className="text-2xl font-semibold">{t("shipping")}</h2>
      <p>{t("manualHint")}</p>
      {editable && remaining.some((i) => i.remaining > 0) && (
        <CommerceForm action={shipmentAction} className="card grid gap-4">
          <input type="hidden" name="operation" value="create" />
          <input type="hidden" name="orderId" value={orderId} />
          <h3>{t("createShipment")}</h3>
          <label>
            {t("workflow")}
            <select
              aria-label={t("workflow")}
              className="input w-full"
              name="workflowId"
              required
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.nameI18n as { fa: string }).fa}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted">{t("quantityHint")}</p>
          {remaining
            .filter((i) => i.remaining > 0)
            .map((i) => (
              <label key={i.id}>
                {(i.productSnapshot as { sku: string }).sku} ·{" "}
                {t("remaining", { n: i.remaining })}
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={i.remaining}
                  name={`qty:${i.id}`}
                  defaultValue={i.remaining}
                />
              </label>
            ))}
          <button className="button" disabled={!workflows.length}>
            {t("createShipment")}
          </button>
        </CommerceForm>
      )}
      {!shipments.length && <p>{t("noShipments")}</p>}
      {shipments.map((s, i) => (
        <article
          key={s.id}
          className="card grid gap-5"
          data-testid="shipment"
          data-shipment-id={s.id}
        >
          <h3 className="text-xl font-semibold">
            {t("parcelIndex", { n: i + 1 })} · {t(s.status)}
          </h3>
          <p>
            {s.items
              .map(
                (si) =>
                  `${(items.find((item) => item.id === si.orderItemId)?.productSnapshot as { sku: string })?.sku} × ${si.quantity}`,
              )
              .join(" · ")}
          </p>
          {s.legs.map((l) => (
            <details
              key={l.id}
              className="rounded-token border border-black/10 p-4"
              data-testid="shipment-leg"
              data-leg-id={l.id}
            >
              <summary className="cursor-pointer">
                {(l.labelI18n as { fa: string }).fa} · {t(l.status)}
              </summary>
              <p className="my-3 text-sm text-muted">{t(l.type)}</p>
              {editable &&
              !["DELIVERED", "CANCELLED"].includes(s.status) &&
              !["DELIVERED", "CANCELLED"].includes(l.status) ? (
                <>
                  <CommerceForm
                    action={shipmentAction}
                    className="grid gap-3 mt-4"
                  >
                    {hidden(s.id, s.version, "saveLeg", l.id)}
                    {(
                      [
                        "carrierName",
                        "service",
                        "trackingNumber",
                        "trackingUrlTemplate",
                      ] as const
                    ).map((k) => (
                      <label key={k}>
                        {t(k)}
                        <input
                          className="input w-full"
                          name={k}
                          defaultValue={l[k]}
                          maxLength={k === "trackingUrlTemplate" ? 1000 : 200}
                        />
                      </label>
                    ))}
                    <p className="text-sm text-muted">{t("templateHint")}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label>
                        {t("costAmount")}
                        <input
                          className="input w-full"
                          name="costAmount"
                          defaultValue={l.costAmount.toString()}
                          readOnly={!!l.shippedAt}
                          inputMode="decimal"
                          required
                        />
                      </label>
                      <label>
                        {t("costCurrency")}
                        <input
                          className="input w-full"
                          name="costCurrency"
                          defaultValue={l.costCurrency}
                          readOnly={!!l.shippedAt}
                          pattern="[A-Z]{3}"
                          required
                        />
                      </label>
                    </div>
                    <label>
                      {t("status")}
                      <select
                        aria-label={t("status")}
                        className="input w-full"
                        name="status"
                        defaultValue={l.status}
                      >
                        {[l.status, ...transitions[l.status]].map((k) => (
                          <option key={k} value={k}>
                            {t(k)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["shippedAt", "eta", "deliveredAt"] as const).map((k) => (
                      <label key={k}>
                        {t(k)} (UTC)
                        <input
                          className="input w-full"
                          type="datetime-local"
                          name={k !== "eta" && l[k] ? undefined : k}
                          defaultValue={l[k]?.toISOString().slice(0, 16) ?? ""}
                          readOnly={
                            (k === "shippedAt" && !!l.shippedAt) ||
                            (k === "deliveredAt" && !!l.deliveredAt)
                          }
                        />
                      </label>
                    ))}
                    <input
                      type="hidden"
                      name="shippedAt"
                      value={l.shippedAt?.toISOString() ?? ""}
                      disabled={!l.shippedAt}
                    />
                    <input
                      type="hidden"
                      name="deliveredAt"
                      value={l.deliveredAt?.toISOString() ?? ""}
                      disabled={!l.deliveredAt}
                    />
                    <p className="text-sm text-muted">{t("dateHint")}</p>
                    <button className="button">{t("saveLeg")}</button>
                  </CommerceForm>
                  {l.status === "PENDING" &&
                    s.legs.filter((row) => row.status !== "CANCELLED").length >
                      1 && (
                      <CommerceForm action={shipmentAction} className="mt-4">
                        {hidden(s.id, s.version, "cancelLeg", l.id)}
                        <button className="button">{t("removeLeg")}</button>
                      </CommerceForm>
                    )}
                  <details className="mt-4">
                    <summary>{t("addEvent")}</summary>
                    <CommerceForm
                      action={shipmentAction}
                      className="grid gap-3 mt-3"
                    >
                      {hidden(s.id, s.version, "event", l.id)}
                      <p className="text-sm text-muted">{t("eventHint")}</p>
                      <label>
                        {t("description")}
                        <textarea
                          className="input w-full"
                          name="description"
                          required
                          maxLength={1000}
                        />
                      </label>
                      <label>
                        {t("eventAt")} (UTC)
                        <input
                          className="input w-full"
                          name="at"
                          type="datetime-local"
                          required
                        />
                      </label>
                      <button className="button">{t("addEvent")}</button>
                    </CommerceForm>
                  </details>
                </>
              ) : (
                <p>
                  {l.carrierName} · {l.trackingNumber} ·{" "}
                  {l.costAmount.toString()} {l.costCurrency}
                </p>
              )}
              {l.events.map((e) => (
                <p key={e.id} className="mt-2 text-sm">
                  {e.at.toLocaleString("fa", { timeZone: "UTC" })} UTC ·{" "}
                  {t(e.status)} {e.description}
                </p>
              ))}
            </details>
          ))}
          {editable && !["DELIVERED", "CANCELLED"].includes(s.status) && (
            <>
              <details>
                <summary>{t("addLeg")}</summary>
                <CommerceForm
                  action={shipmentAction}
                  className="mt-3 grid gap-3"
                >
                  {hidden(s.id, s.version, "addLeg")}
                  <label>
                    {t("type")}
                    <select
                      aria-label={t("type")}
                      className="input w-full"
                      name="type"
                    >
                      <option value="DOMESTIC">{t("DOMESTIC")}</option>
                      <option value="INTERNATIONAL">
                        {t("INTERNATIONAL")}
                      </option>
                    </select>
                  </label>
                  {(["fa", "tr", "en"] as const).map((locale) => (
                    <label key={locale}>
                      {t("legLabel")} ({t(locale)})
                      <input
                        className="input w-full"
                        name={`label${locale[0].toUpperCase() + locale.slice(1)}`}
                        required
                        maxLength={100}
                      />
                    </label>
                  ))}
                  <input type="hidden" name="carrierName" value="" />
                  <input type="hidden" name="trackingUrlTemplate" value="" />
                  <button className="button">{t("addLeg")}</button>
                </CommerceForm>
              </details>
              {!s.legs.some((l) => l.shippedAt) && (
                <CommerceForm action={shipmentAction}>
                  {hidden(s.id, s.version, "cancelShipment")}
                  <button className="button">{t("cancelShipment")}</button>
                </CommerceForm>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
