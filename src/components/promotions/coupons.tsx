"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Iso } from "@/components/storefront/iso";
import { integer, text, utc } from "@/modules/promotions/editor";
import {
  issueCouponsAction,
  couponStatusAction,
} from "@/app/admin/(dashboard)/promotions/actions";
import { RequestForm, ConfirmSave } from "./request-form";
export function CouponIssuer({
  marketId,
  programId,
  now,
}: {
  marketId: string;
  programId: string;
  now: string;
}) {
  const t = useTranslations("promotionAdmin"),
    router = useRouter();
  const [mode, setMode] = useState("single"),
    [issued, setIssued] = useState<{ id: string; code: string }[]>([]);
  return (
    <RequestForm
      build={(f) => ({
        marketId,
        programId,
        mutationKey: crypto.randomUUID(),
        confirmed: f.get("confirmed") === "on",
        codes: mode === "single" ? [text(f, "code")] : [],
        generateCount: mode === "bulk" ? integer(f, "count") : 0,
        startsAt: utc(f, "startsAt"),
        endsAt: utc(f, "endsAt"),
        totalUsageCap: integer(f, "totalUsageCap"),
        perCustomerCap: integer(f, "perCustomerCap"),
      })}
      action={issueCouponsAction}
      onSuccess={(rows) => {
        setIssued(rows);
        router.refresh();
      }}
    >
      <p>{t("couponHelp")}</p>
      <label>
        {t("issueMode")}
        <select
          className="input w-full"
          name="issueMode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="single">{t("single")}</option>
          <option value="bulk">{t("bulk")}</option>
        </select>
      </label>
      {mode === "single" ? (
        <label>
          {t("code")}
          <input
            className="input w-full"
            name="code"
            dir="ltr"
            required
            minLength={4}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,63}"
          />
        </label>
      ) : (
        <label>
          {t("count")}
          <input
            className="input w-full"
            type="number"
            name="count"
            min={1}
            max={100}
            required
            defaultValue={10}
          />
        </label>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {["startsAt", "endsAt", "totalUsageCap", "perCustomerCap"].map((k) => (
          <label key={k}>
            {t(k)}
            <input
              className="input w-full"
              type={k.endsWith("At") ? "datetime-local" : "number"}
              name={k}
              required={k === "startsAt"}
              min={k.endsWith("At") ? undefined : 0}
              defaultValue={k === "startsAt" ? now.slice(0, 16) : ""}
            />
          </label>
        ))}
      </div>
      <ConfirmSave label="issue" />
      {issued.length > 0 && (
        <div role="status" className="grid gap-2">
          <p>{t("issued", { count: issued.length })}</p>
          {issued.map((c) => (
            <span className="break-all" key={c.id}>
              <Iso>{c.code}</Iso>
            </span>
          ))}
        </div>
      )}
    </RequestForm>
  );
}
export function CouponStatus({
  marketId,
  id,
  version,
  status,
}: {
  marketId: string;
  id: string;
  version: number;
  status: string;
}) {
  const t = useTranslations("promotionAdmin"),
    router = useRouter();
  if (status === "ARCHIVED") return <p>{t("archiveWarning")}</p>;
  return (
    <RequestForm
      build={(f) => ({
        marketId,
        id,
        expectedVersion: version,
        status: text(f, "status"),
        confirmed: f.get("confirmed") === "on",
      })}
      action={couponStatusAction}
      recoveryMode="reload"
      onSuccess={() => router.refresh()}
    >
      <label>
        {t("status")}
        <select className="input w-full" name="status" defaultValue={status}>
          {["ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
            <option key={s} value={s}>
              {t(`statusOptions.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted">{t("archiveWarning")}</p>
      <ConfirmSave />
    </RequestForm>
  );
}
