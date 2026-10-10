"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { FittingConfig } from "@/modules/fitting/contracts";
import { MediaPicker } from "./media-picker";
import { Card, Input, Select, Button } from "@/components/ui";
import {
  saveSettings,
  grantCoinsAction,
  refundSessionAction,
} from "@/app/admin/(dashboard)/settings/fitting/actions";
export function FittingSettings({
  initial,
  version,
  keyReady,
  markets,
  customers,
  grantMarketId,
  segments,
  mediaUrls,
  review,
}: {
  initial: FittingConfig;
  version: string | null;
  keyReady: boolean;
  markets: { id: string; code: string; currency: string }[];
  customers: { id: string; label: string }[];
  grantMarketId: string | null;
  segments: { id: string; name: string; marketId: string }[];
  mediaUrls: Record<string, string>;
  review: {
    id: string;
    cost: string;
    code: string | null;
  }[];
}) {
  const t = useTranslations("fitting"),
    [config, setConfig] = useState(initial),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [grantKey, setGrantKey] = useState(() => crypto.randomUUID()),
    [recipientIds, setRecipients] = useState<string[]>([]),
    [segmentId, setSegment] = useState(""),
    [amount, setAmount] = useState("100"),
    [reason, setReason] = useState(""),
    [expiry, setExpiry] = useState("");
  const configVersion = useRef(version);
  useEffect(() => {
    if (configVersion.current !== version) {
      configVersion.current = version;
      setConfig(initial);
      setConfirmed(false);
    }
  }, [initial, version]);
  const set = (patch: Partial<FittingConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));
  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    isGrant = false,
  ) {
    setBusy(true);
    setResult("");
    try {
      const r = await fn();
      setResult(
        r.ok
          ? t("saved")
          : t.has(`error_${r.error}`)
            ? t(`error_${r.error}`)
            : t("error"),
      );
      if (r.ok) {
        setConfirmed(false);
        if (isGrant) setGrantKey(crypto.randomUUID());
      }
    } catch {
      setResult(t("requestUnknown"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("adminTitle")}</h1>
        <p className="muted mt-2">{t("adminHelp")}</p>
      </header>
      <Card className="grid gap-4">
        <p>{keyReady ? t("keyReady") : t("keyMissing")}</p>
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />{" "}
          {t("enabled")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.coinSalesEnabled}
            onChange={(e) => set({ coinSalesEnabled: e.target.checked })}
          />{" "}
          {t("coinSalesEnabled")}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              "costCoins",
              "welcomeCoins",
              "dailyFreeUses",
              "dailyLimit",
              "globalDailyLimit",
              "timezone",
            ] as const
          ).map((key) => (
            <label key={key}>
              {t(key)}
              <Input
                value={String(config[key])}
                type={
                  ["dailyFreeUses", "dailyLimit", "globalDailyLimit"].includes(
                    key,
                  )
                    ? "number"
                    : "text"
                }
                min="0"
                onChange={(e) =>
                  set({
                    [key]: [
                      "dailyFreeUses",
                      "dailyLimit",
                      "globalDailyLimit",
                    ].includes(key)
                      ? Number(e.target.value)
                      : e.target.value,
                  })
                }
              />
            </label>
          ))}
          <label>
            {t("providerModel")}
            <Select
              value={config.model}
              onChange={(e) =>
                set({ model: e.target.value as FittingConfig["model"] })
              }
            >
              <option value="gpt-image-1.5">GPT Image 1.5</option>
              <option value="gpt-image-2">GPT Image 2</option>
            </Select>
          </label>
          <label>
            {t("quality")}
            <Select
              value={config.quality}
              onChange={(e) =>
                set({ quality: e.target.value as FittingConfig["quality"] })
              }
            >
              {["low", "medium", "high"].map((q) => (
                <option key={q} value={q}>
                  {t(`quality_${q}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="muted text-sm">{t("limitsHelp")}</p>
      </Card>
      <Card className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("models")}</h2>
        {config.models.map((m, index) => (
          <div
            className="grid gap-3 border border-black/10 p-4 sm:grid-cols-2"
            key={m.id}
          >
            <label>
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) =>
                  set({
                    models: config.models.map((v, i) =>
                      i === index ? { ...v, enabled: e.target.checked } : v,
                    ),
                  })
                }
              />{" "}
              {t("enabled")} · {t("modelName")} {index + 1}
            </label>
            <Select
              aria-label={t("modelKind")}
              value={m.kind}
              onChange={(e) =>
                set({
                  models: config.models.map((v, i) =>
                    i === index
                      ? { ...v, kind: e.target.value as typeof m.kind }
                      : v,
                  ),
                })
              }
            >
              {["WOMAN", "MAN", "GIRL", "BOY"].map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </Select>
            {(["fa", "tr", "en"] as const).map((l) => (
              <label key={l}>
                {t("modelName")} · {l}
                <Input
                  value={m.label[l]}
                  onChange={(e) =>
                    set({
                      models: config.models.map((v, i) =>
                        i === index
                          ? { ...v, label: { ...v.label, [l]: e.target.value } }
                          : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <MediaPicker
              name={`model-${m.id}`}
              label={t("modelImage")}
              defaultMediaId={m.mediaId}
              defaultUrl={mediaUrls[m.mediaId]}
              onSelect={(mediaId) =>
                set({
                  models: config.models.map((v, i) =>
                    i === index ? { ...v, mediaId } : v,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              onClick={() =>
                set({ models: config.models.filter((_, i) => i !== index) })
              }
            >
              {t("remove")}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            set({
              models: [
                ...config.models,
                {
                  id: crypto.randomUUID(),
                  label: { fa: "", tr: "", en: "" },
                  kind: "WOMAN",
                  mediaId: "",
                  enabled: true,
                },
              ],
            })
          }
        >
          {t("addModel")}
        </Button>
      </Card>
      <Card className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("purchaseRewards")}</h2>
        {markets.map((m) => {
          const r = config.rewards.find((r) => r.marketId === m.id);
          return (
            <div key={m.id} className="grid gap-3 sm:grid-cols-3">
              <label>
                <input
                  type="checkbox"
                  checked={!!r}
                  onChange={(e) =>
                    set({
                      rewards: e.target.checked
                        ? [
                            ...config.rewards,
                            { marketId: m.id, spendAmount: "100", coins: "25" },
                          ]
                        : config.rewards.filter((r) => r.marketId !== m.id),
                    })
                  }
                />{" "}
                {m.code} · {m.currency}
              </label>
              {r && (
                <>
                  <label>
                    {t("spendAmount")}
                    <Input
                      value={r.spendAmount}
                      onChange={(e) =>
                        set({
                          rewards: config.rewards.map((v) =>
                            v.marketId === m.id
                              ? { ...v, spendAmount: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("rewardCoins")}
                    <Input
                      value={r.coins}
                      onChange={(e) =>
                        set({
                          rewards: config.rewards.map((v) =>
                            v.marketId === m.id
                              ? { ...v, coins: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          );
        })}
        <p className="muted text-sm">{t("rewardsHelp")}</p>
      </Card>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        {t("confirmAdmin")}
      </label>
      <Button
        disabled={busy || !confirmed}
        onClick={() =>
          run(() => saveSettings({ config, version, confirm: true }))
        }
      >
        {t("saveSettings")}
      </Button>
      <Card className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("manualGrant")}</h2>
        <label>
          {t("recipients")}
          <Select
            multiple
            size={6}
            value={recipientIds}
            onChange={(e) => {
              setRecipients(
                Array.from(e.target.selectedOptions).map((o) => o.value),
              );
              setSegment("");
            }}
          >
            {customers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          {t("recipientGroup")}
          <Select
            value={segmentId}
            onChange={(e) => {
              setSegment(e.target.value);
              setRecipients([]);
            }}
          >
            <option value="">{t("none")}</option>
            {segments.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} · {markets.find((m) => m.id === s.marketId)?.code}
              </option>
            ))}
          </Select>
        </label>
        <label>
          {t("grantAmount")}
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {t("grantReason")}
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label>
          {t("expiresAt")}
          <Input
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
        <Button
          disabled={
            busy ||
            !grantMarketId ||
            !confirmed ||
            (!recipientIds.length && !segmentId) ||
            !reason.trim()
          }
          onClick={() =>
            run(
              () =>
                grantCoinsAction({
                  requestKey: grantKey,
                  marketId: grantMarketId,
                  customerIds: recipientIds,
                  segmentId: segmentId || undefined,
                  amount,
                  reason,
                  expiresAt: expiry ? new Date(expiry).toISOString() : null,
                  confirm: true,
                }),
              true,
            )
          }
        >
          {t("grant")}
        </Button>
      </Card>
      {review.length > 0 && (
        <Card className="grid gap-3">
          <h2>{t("reviewQueue")}</h2>
          <p className="muted">{t("reviewHelp")}</p>
          {review.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-3">
              <span>
                {s.id} · {s.cost} {t("coins")}
              </span>
              <Button
                disabled={busy || !confirmed}
                onClick={() =>
                  run(() =>
                    refundSessionAction({
                      id: s.id,
                      confirm: true,
                      refund: true,
                    }),
                  )
                }
              >
                {t("refundCoins")}
              </Button>
            </div>
          ))}
        </Card>
      )}
      {result && <p role="status">{result}</p>}
    </div>
  );
}
