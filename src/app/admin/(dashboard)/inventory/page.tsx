import { adminInventoryCosts } from "@/modules/inventory/admin-costs";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import {
  adjustInventory,
  importInventoryCsv,
  receiveInventory,
  saveGlobalLowStockThreshold,
  saveStockLowStockThreshold,
} from "./actions";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ variantId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "inventory.view")))
    redirect("/admin");
  const mayViewCost = await can(session.user.id, "pricing.cost.view");
  const [
    t,
    mayReceive,
    mayAdjust,
    warehouses,
    variants,
    stock,
    lots,
    movements,
    settings,
  ] = await Promise.all([
    getTranslations("phase03Admin"),
    can(session.user.id, "inventory.receive"),
    can(session.user.id, "inventory.stock.adjust"),
    db.warehouse.findMany({ where: { isActive: true } }),
    db.variant.findMany({
      include: { product: true },
      orderBy: { sku: "asc" },
      take: 300,
    }),
    db.stockItem.findMany({
      include: { warehouse: true, variant: { include: { product: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    mayViewCost ? adminInventoryCosts(session.user.id) : Promise.resolve([]),
    db.stockMovement.findMany({
      include: { variant: true, warehouse: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.siteSettings.findUniqueOrThrow({
      where: { id: "default" },
      select: { inventory: true },
    }),
  ]);
  const inventorySettings = settings.inventory as {
    lowStockThreshold?: unknown;
  };
  const globalLowStockThreshold =
    typeof inventorySettings.lowStockThreshold === "number"
      ? inventorySettings.lowStockThreshold
      : 2;
  const requestedVariantId = (await searchParams).variantId;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("inventoryTitle")}</h1>
        <p className="muted mt-1">{t("inventorySubtitle")}</p>
      </div>
      {mayAdjust && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t("stockThresholds")}</h2>
          <p className="muted mb-3 text-sm">{t("stockThresholdHelp")}</p>
          <CatalogActionForm
            action={saveGlobalLowStockThreshold}
            submitLabel={t("save")}
            className="flex max-w-xl gap-2"
          >
            <Input
              name="threshold"
              type="number"
              min="0"
              required
              defaultValue={globalLowStockThreshold}
              placeholder={t("globalThreshold")}
            />
          </CatalogActionForm>
        </Card>
      )}
      {mayReceive && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t("receiveStock")}</h2>
          <CatalogActionForm
            action={receiveInventory}
            className="grid gap-3 md:grid-cols-3"
          >
            <Select name="warehouseId">
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {(warehouse.nameI18n as { fa?: string }).fa ?? warehouse.code}
                </option>
              ))}
            </Select>
            <Select name="variantId" defaultValue={requestedVariantId}>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.sku} ·{" "}
                  {(variant.product.titleI18n as { fa?: string }).fa}
                </option>
              ))}
            </Select>
            <Input
              name="quantity"
              type="number"
              min="1"
              required
              placeholder={t("quantity")}
            />
            <Input name="unitCostAmount" required placeholder={t("unitCost")} />
            <Select name="unitCostCurrency" defaultValue="TRY">
              <option>TRY</option>
              <option>USD</option>
              <option>CAD</option>
              <option>IRT</option>
            </Select>
            <Input
              name="receivedAt"
              type="datetime-local"
              required
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
            <span />
            <span className="md:col-span-3" />
          </CatalogActionForm>
        </Card>
      )}
      {mayReceive && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t("csvImport")}</h2>
          <p className="muted text-sm" dir="ltr">
            sku,quantity,unitCost,currency
          </p>
          <CatalogActionForm action={importInventoryCsv} className="grid gap-3">
            <Input name="file" type="file" accept=".csv,text/csv" required />
          </CatalogActionForm>
        </Card>
      )}
      <Card className="overflow-auto p-5">
        <h2 className="mb-3 font-semibold">{t("currentStock")}</h2>
        <Table>
          <thead>
            <tr>
              <TH>SKU</TH>
              <TH>{t("warehouse")}</TH>
              <TH>{t("onHand")}</TH>
              <TH>{t("reserved")}</TH>
              <TH>{t("quarantined")}</TH>
              <TH>{t("damaged")}</TH>
              <TH>{t("sellable")}</TH>
              <TH>{t("lowStockThreshold")}</TH>
              {mayAdjust && <TH>{t("adjust")}</TH>}
            </tr>
          </thead>
          <tbody>
            {stock.map((item) => {
              const sellable = item.onHand - item.reserved;
              return (
                <tr key={item.id}>
                  <TD>
                    <bdi dir="ltr">{item.variant.sku}</bdi>
                  </TD>
                  <TD>{item.warehouse.code}</TD>
                  <TD>{item.onHand}</TD>
                  <TD>{item.reserved}</TD>
                  <TD>{item.quarantinedQty}</TD>
                  <TD>{item.damagedQty}</TD>
                  <TD>
                    {sellable}
                    {sellable <=
                    (item.lowStockThreshold ?? globalLowStockThreshold)
                      ? ` · ${t("low")}`
                      : ""}
                  </TD>
                  <TD>
                    {mayAdjust ? (
                      <CatalogActionForm
                        action={saveStockLowStockThreshold}
                        submitLabel={t("save")}
                        className="flex min-w-48 gap-2"
                      >
                        <input
                          type="hidden"
                          name="stockItemId"
                          value={item.id}
                        />
                        <Input
                          name="threshold"
                          type="number"
                          min="0"
                          defaultValue={item.lowStockThreshold ?? ""}
                          placeholder={`${t("globalThreshold")} (${globalLowStockThreshold})`}
                        />
                      </CatalogActionForm>
                    ) : (
                      (item.lowStockThreshold ?? globalLowStockThreshold)
                    )}
                  </TD>
                  {mayAdjust && (
                    <TD>
                      <CatalogActionForm
                        action={adjustInventory}
                        submitLabel={t("save")}
                        className="flex min-w-72 gap-2"
                      >
                        <input
                          type="hidden"
                          name="stockItemId"
                          value={item.id}
                        />
                        <Input
                          name="quantity"
                          type="number"
                          required
                          placeholder={t("signedQuantity")}
                        />
                        <Input
                          name="unitCostAmount"
                          placeholder={t("positiveAdjustmentCost")}
                        />
                        <Select name="unitCostCurrency" defaultValue="TRY">
                          <option>TRY</option>
                          <option>USD</option>
                          <option>CAD</option>
                          <option>IRT</option>
                        </Select>
                        <Input
                          name="reason"
                          required
                          placeholder={t("reason")}
                        />
                      </CatalogActionForm>
                    </TD>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {mayViewCost && (
        <Card className="overflow-auto p-5">
          <h2 className="mb-3 font-semibold">{t("lots")}</h2>
          <Table>
            <thead>
              <tr>
                <TH>SKU</TH>
                <TH>{t("receivedRemaining")}</TH>
                <TH>{t("originalCost")}</TH>
                <TH>TRY / USD</TH>
                <TH>{t("time")}</TH>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <TD>
                    <bdi dir="ltr">{lot.variant.sku}</bdi>
                  </TD>
                  <TD>
                    {lot.qtyReceived} / {lot.qtyRemaining}
                  </TD>
                  <TD>
                    <bdi dir="ltr">
                      {lot.unitCostAmount.toString()} {lot.unitCostCurrency}
                    </bdi>
                  </TD>
                  <TD>
                    <bdi dir="ltr">
                      {lot.unitCostAmountTry.toString()} /{" "}
                      {lot.unitCostAmountUsd.toString()}
                    </bdi>
                  </TD>
                  <TD>
                    <bdi dir="ltr">{lot.receivedAt.toISOString()}</bdi>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card className="overflow-auto p-5">
        <h2 className="mb-3 font-semibold">{t("movementLedger")}</h2>
        <Table>
          <thead>
            <tr>
              <TH>SKU</TH>
              <TH>{t("type")}</TH>
              <TH>{t("quantity")}</TH>
              <TH>{t("reason")}</TH>
              <TH>{t("time")}</TH>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <TD>
                  <bdi dir="ltr">{movement.variant.sku}</bdi>
                </TD>
                <TD>{movement.type}</TD>
                <TD>{movement.quantity}</TD>
                <TD>{movement.reason ?? "—"}</TD>
                <TD>
                  <bdi dir="ltr">{movement.createdAt.toISOString()}</bdi>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
