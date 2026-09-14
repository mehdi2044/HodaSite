"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@/components/ui";
import { saveAi } from "@/app/admin/(dashboard)/settings/ai/actions";
import { providers, type AiConfig } from "@/modules/ai/contracts";
export function AiSettingsForm({
  initial,
  prompts,
  keys,
}: {
  initial: AiConfig;
  prompts: { feature: string; style: string; forbiddenClaims: string }[];
  keys: Record<string, boolean>;
}) {
  const t = useTranslations("aiAdmin"),
    [config, setConfig] = useState(initial),
    [feature, setFeature] = useState("product"),
    [style, setStyle] = useState(
      prompts.find((p) => p.feature === "product")?.style ?? t("defaultStyle"),
    ),
    [forbidden, setForbidden] = useState(
      prompts.find((p) => p.feature === "product")?.forbiddenClaims ??
        t("defaultForbidden"),
    ),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await saveAi({
            config,
            style,
            forbiddenClaims: forbidden,
            feature,
            confirm,
          });
          setMessage(r.ok ? t("saved") : r.message);
        } catch {
          setMessage(t("errors.UNKNOWN"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {providers.map((p) => (
          <article
            className="rounded-token border border-black/10 bg-surface p-4"
            key={p}
          >
            <bdi>{p}</bdi>
            <p className="text-sm">
              {keys[p] ? t("keyPresent") : t("keyMissing")}
            </p>
          </article>
        ))}
      </div>
      <p className="text-sm text-muted">{t("keysHelp")}</p>
      <fieldset
        disabled={busy}
        className="grid gap-5 rounded-token bg-surface p-4"
      >
        <legend className="px-2 font-semibold">{t("connection")}</legend>
        <label>
          {t("provider")}
          <Select
            value={config.provider}
            onChange={(e) =>
              setConfig({
                ...config,
                provider: e.target.value as AiConfig["provider"],
              })
            }
          >
            {providers.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {["enabled", "product", "finance", "vision"].map((k) => (
            <label className="flex items-start gap-2" key={k}>
              <input
                type="checkbox"
                checked={config[k as "enabled"]}
                onChange={(e) =>
                  setConfig({ ...config, [k]: e.target.checked })
                }
              />
              {t(k)}
            </label>
          ))}
        </div>
        {["cheap", "smart"].map((tier) => (
          <div
            className="grid gap-3 rounded-token border border-black/10 p-3 sm:grid-cols-3"
            key={tier}
          >
            <label>
              {t(tier)}
              <Input
                required
                dir="ltr"
                value={config[tier as "cheap"].name}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    [tier]: {
                      ...config[tier as "cheap"],
                      name: e.target.value,
                    },
                  })
                }
              />
            </label>
            {["inputUsd", "outputUsd"].map((k) => (
              <label key={k}>
                {t(k)}
                <Input
                  required
                  inputMode="decimal"
                  dir="ltr"
                  value={config[tier as "cheap"][k as "inputUsd"]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [tier]: {
                        ...config[tier as "cheap"],
                        [k]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
        <p className="text-sm text-muted">{t("pricingHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {["productTier", "financeTier"].map((k) => (
            <label key={k}>
              {t(k)}
              <Select
                value={config[k as "productTier"]}
                onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
              >
                <option value="cheap">{t("cheap")}</option>
                <option value="smart">{t("smart")}</option>
              </Select>
            </label>
          ))}
          {["softUsd", "hardUsd"].map((k) => (
            <label key={k}>
              {t(k)}
              <Input
                required
                dir="ltr"
                inputMode="decimal"
                value={config[k as "softUsd"]}
                onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
              />
            </label>
          ))}
          {["concurrency", "maxOutputTokens"].map((k) => (
            <label key={k}>
              {t(k)}
              <Input
                required
                type="number"
                value={config[k as "concurrency"]}
                onChange={(e) =>
                  setConfig({ ...config, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        disabled={busy}
        className="grid gap-3 rounded-token bg-surface p-4"
      >
        <legend className="px-2 font-semibold">{t("prompt")}</legend>
        <label>
          {t("feature")}
          <Select
            value={feature}
            onChange={(e) => {
              const f = e.target.value;
              setFeature(f);
              setStyle(
                prompts.find((p) => p.feature === f)?.style ??
                  t("defaultStyle"),
              );
              setForbidden(
                prompts.find((p) => p.feature === f)?.forbiddenClaims ??
                  t("defaultForbidden"),
              );
            }}
          >
            <option value="product">{t("product")}</option>
            <option value="finance">{t("finance")}</option>
          </Select>
        </label>
        <label>
          {t("style")}
          <textarea
            className="input min-h-32 w-full"
            required
            maxLength={4000}
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          />
        </label>
        <label>
          {t("forbidden")}
          <textarea
            className="input min-h-24 w-full"
            maxLength={2000}
            value={forbidden}
            onChange={(e) => setForbidden(e.target.value)}
          />
        </label>
      </fieldset>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        {t("settingsConfirm")}
      </label>
      <Button disabled={busy || !confirm} type="submit">
        {busy ? t("working") : t("save")}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
