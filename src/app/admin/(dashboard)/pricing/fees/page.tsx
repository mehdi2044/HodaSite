import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import { ActionSubmit } from "@/components/admin/action-submit";
import { FeeParamFields } from "@/components/admin/fee-param-fields";
import type { FeeMethod } from "@/modules/fees";
import { saveFeeRule, toggleFeeRule } from "./actions";

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "fees.manage")))
    redirect("/admin");
  const t = await getTranslations("phase03Admin");
  const [markets, rules, categories] = await Promise.all([
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.feeRule.findMany({
      include: { market: true },
      orderBy: [{ type: "asc" }, { priority: "desc" }],
    }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const editId = (await searchParams).edit;
  const edit = rules.find((rule) => rule.id === editId);
  const labels = edit?.labelI18n as
    { fa?: string; tr?: string; en?: string } | undefined;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("feesTitle")}</h1>
          <p className="muted mt-1">{t("feesSubtitle")}</p>
        </div>
        <Link className="button" href="/admin/pricing/fees/simulator">
          {t("openSimulator")}
        </Link>
      </div>
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">
          {edit ? t("editRule") : t("newRule")}
        </h2>
        <CatalogActionForm
          action={saveFeeRule}
          className="grid gap-3 md:grid-cols-3"
        >
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <Select name="marketId" defaultValue={edit?.marketId}>
            {markets.map((market) => (
              <option value={market.id} key={market.id}>
                {market.code}
              </option>
            ))}
          </Select>
          <Select name="type" defaultValue={edit?.type}>
            <option>SHIPPING</option>
            <option>CUSTOMS</option>
            <option>SERVICE</option>
            <option>TAX</option>
          </Select>
          <FeeParamFields
            initialMethod={(edit?.method ?? "FIXED") as FeeMethod}
            initialParams={
              (edit?.params as Record<string, unknown> | undefined) ?? {
                amount: "150",
              }
            }
          />
          <Input
            name="nameFa"
            required
            defaultValue={labels?.fa}
            placeholder={t("nameFa")}
          />
          <Input
            name="nameTr"
            required
            defaultValue={labels?.tr}
            placeholder={t("nameTr")}
          />
          <Input
            name="nameEn"
            required
            defaultValue={labels?.en}
            placeholder={t("nameEn")}
          />
          <Input
            name="province"
            defaultValue={edit?.province ?? ""}
            placeholder={t("provinceOptional")}
          />
          <Input
            name="city"
            defaultValue={edit?.city ?? ""}
            placeholder={t("cityOptional")}
          />
          <Input
            name="postalPrefix"
            defaultValue={edit?.postalPrefix ?? ""}
            placeholder={t("postalPrefix")}
          />
          <label className="grid gap-1">
            <span>{t("categoriesOptional")}</span>
            <select
              className="input min-h-28"
              name="categoryIds"
              multiple
              defaultValue={edit?.categoryIds}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {(category.titleI18n as { fa?: string }).fa ?? category.id}
                </option>
              ))}
            </select>
          </label>
          <Input
            name="priority"
            type="number"
            defaultValue={edit?.priority ?? 0}
            placeholder={t("priority")}
          />
          <Input
            name="minAmount"
            defaultValue={edit?.minAmount?.toString() ?? ""}
            placeholder={t("minimum")}
          />
          <Input
            name="maxAmount"
            defaultValue={edit?.maxAmount?.toString() ?? ""}
            placeholder={t("maximum")}
          />
          <Input
            name="validFrom"
            type="datetime-local"
            required
            defaultValue={(edit?.validFrom ?? new Date())
              .toISOString()
              .slice(0, 16)}
          />
          <Input
            name="validUntil"
            type="datetime-local"
            defaultValue={edit?.validUntil?.toISOString().slice(0, 16) ?? ""}
          />
          <label className="flex min-h-11 items-center gap-2">
            <input
              name="absorb"
              type="checkbox"
              defaultChecked={edit?.absorb}
            />
            {t("absorbed")}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              name="taxable"
              type="checkbox"
              defaultChecked={edit?.taxable}
            />
            {t("taxable")}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={edit?.isActive ?? true}
            />
            {t("active")}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              name="selectable"
              type="checkbox"
              defaultChecked={edit?.selectable}
            />
            {(await getTranslations("commerce"))("selectableShipping")}
          </label>
          <span className="md:col-span-3" />
        </CatalogActionForm>
      </Card>
      <Card className="overflow-auto p-5">
        <Table>
          <thead>
            <tr>
              <TH>{t("name")}</TH>
              <TH>{t("market")}</TH>
              <TH>{t("typeMethod")}</TH>
              <TH>{t("scope")}</TH>
              <TH>{t("status")}</TH>
              <TH>{t("actions")}</TH>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const name = rule.labelI18n as { fa?: string };
              return (
                <tr key={rule.id}>
                  <TD>{name.fa ?? rule.id}</TD>
                  <TD>{rule.market.code}</TD>
                  <TD>
                    {rule.type} / {rule.method}
                  </TD>
                  <TD>
                    {[rule.province, rule.city, rule.postalPrefix]
                      .filter(Boolean)
                      .join(" · ") || t("wholeMarket")}
                  </TD>
                  <TD>{rule.isActive ? t("active") : t("inactive")}</TD>
                  <TD>
                    <div className="flex gap-2">
                      <Link href={`/admin/pricing/fees?edit=${rule.id}`}>
                        {t("edit")}
                      </Link>
                      <ActionSubmit
                        action={toggleFeeRule}
                        fields={{ id: rule.id }}
                        label={rule.isActive ? t("disable") : t("enable")}
                        variant="ghost"
                      />
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
