"use client";
import { useTranslations } from "next-intl";
import { themeContrastFailures } from "@/lib/contrast";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Card, CardTitle, Select } from "@/components/ui";
import { saveTheme } from "./actions";
import { COLOR_KEYS, BUTTON_RADIUS } from "@/lib/theme-defaults";

export type ThemeDraft = {
  light: Record<string, string>;
  dark: Record<string, string>;
  radius: string;
  darkMode: "off" | "on" | "system";
  headerStyle: "minimal" | "centered" | "editorial";
  buttonStyle: "pill" | "soft" | "sharp";
  heroStyle: string;
  fontFa: string;
  fontLatin: string;
  customCss: string;
};

function payloadFor(draft: ThemeDraft) {
  return {
    type: "theme-preview" as const,
    vars: {
      ...draft.light,
      radius: draft.radius,
      "radius-button": BUTTON_RADIUS[draft.buttonStyle] ?? BUTTON_RADIUS.pill,
    },
    buttonStyle: draft.buttonStyle,
  };
}

export function ThemeEditor({ initial }: { initial: ThemeDraft }) {
  const t = useTranslations("themeEditor");
  const [state, formAction, pending] = useActionState(saveTheme, null);
  const [draft, setDraft] = useState<ThemeDraft>(initial);
  const iframe390 = useRef<HTMLIFrameElement>(null);
  const iframe1280 = useRef<HTMLIFrameElement>(null);
  const [frameGen, setFrameGen] = useState(0);

  function broadcast() {
    const payload = payloadFor(draft);
    iframe390.current?.contentWindow?.postMessage(
      payload,
      window.location.origin,
    );
    iframe1280.current?.contentWindow?.postMessage(
      payload,
      window.location.origin,
    );
  }

  useEffect(broadcast, [draft]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "theme-preview-ready") return;
      (e.source as Window | null)?.postMessage(
        payloadFor(draft),
        window.location.origin,
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [draft]);

  useEffect(() => {
    if (state?.ok) setFrameGen((v) => v + 1); // reload preview iframes after a successful save
  }, [state]);

  function setColor(group: "light" | "dark", key: string, value: string) {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <form action={formAction} className="grid gap-6">
        {(["light", "dark"] as const).map((mode) => {
          const failures = themeContrastFailures(draft[mode]);
          return failures.length ? (
            <div key={mode} role="status" className="card">
              <h2>{t(mode)}</h2>
              <p>{t("contrast")}</p>
              <ul>
                {failures.map((pair) => (
                  <li key={pair.foreground + pair.background}>
                    {t(pair.foreground)} / {t(pair.background)}:{" "}
                    <bdi>{pair.ratio}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ) : null;
        })}
        <Card>
          <CardTitle>{t("light")}</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="grid gap-1 text-sm">
                {t(k)}
                <input
                  type="color"
                  name={`light_${k}`}
                  value={draft.light[k]}
                  onChange={(e) => setColor("light", k, e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-black/15"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>{t("dark")}</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="grid gap-1 text-sm">
                {t(k)}
                <input
                  type="color"
                  name={`dark_${k}`}
                  value={draft.dark[k]}
                  onChange={(e) => setColor("dark", k, e.target.value)}
                  className="h-10 w-full rounded-[8px] border border-black/15"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card className="grid gap-4">
          <CardTitle>{t("appearance")}</CardTitle>
          <label className="grid gap-1">
            {t("darkMode")}
            <Select
              name="darkMode"
              value={draft.darkMode}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  darkMode: e.target.value as ThemeDraft["darkMode"],
                }))
              }
            >
              <option value="off">{t("off")}</option>
              <option value="on">{t("on")}</option>
              <option value="system">{t("system")}</option>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("header")}
            <Select
              name="headerStyle"
              value={draft.headerStyle}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  headerStyle: e.target.value as ThemeDraft["headerStyle"],
                }))
              }
            >
              <option value="minimal">{t("minimal")}</option>
              <option value="centered">{t("centered")}</option>
              <option value="editorial">{t("editorial")}</option>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("button")}
            <Select
              name="buttonStyle"
              value={draft.buttonStyle}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  buttonStyle: e.target.value as ThemeDraft["buttonStyle"],
                }))
              }
            >
              <option value="pill">{t("pill")}</option>
              <option value="soft">{t("soft")}</option>
              <option value="sharp">{t("sharp")}</option>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("hero")}
            <Select
              name="heroStyle"
              value={draft.heroStyle}
              onChange={(e) =>
                setDraft((d) => ({ ...d, heroStyle: e.target.value }))
              }
            >
              <option value="editorial">{t("editorial")}</option>
              <option value="minimal">{t("minimal")}</option>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("radius")}
            <input
              name="radius"
              value={draft.radius}
              onChange={(e) =>
                setDraft((d) => ({ ...d, radius: e.target.value }))
              }
              className="min-h-11 rounded-[10px] border border-black/15 px-3"
            />
          </label>
        </Card>

        <Card className="grid gap-4">
          <CardTitle>{t("font")}</CardTitle>
          <label className="grid gap-1">
            {t("fontFa")}
            <Select
              name="fontFa"
              value={draft.fontFa}
              onChange={(e) =>
                setDraft((d) => ({ ...d, fontFa: e.target.value }))
              }
            >
              <option value="Vazirmatn">Vazirmatn</option>
            </Select>
          </label>
          <label className="grid gap-1">
            {t("fontLatin")}
            <Select
              name="fontLatin"
              value={draft.fontLatin}
              onChange={(e) =>
                setDraft((d) => ({ ...d, fontLatin: e.target.value }))
              }
            >
              <option value="Inter">Inter</option>
            </Select>
          </label>
        </Card>

        <Card className="grid gap-2">
          <CardTitle>{t("css")}</CardTitle>
          <textarea
            aria-label={t("css")}
            name="customCss"
            value={draft.customCss}
            onChange={(e) =>
              setDraft((d) => ({ ...d, customCss: e.target.value }))
            }
            rows={6}
            className="rounded-[10px] border border-black/15 p-3 font-mono text-sm"
            placeholder={t("cssHint")}
          />
        </Card>

        {state && !state.ok && (
          <p role="alert" style={{ color: "var(--error)" }}>
            {state.message}
          </p>
        )}
        {state?.ok && (
          <p role="status" style={{ color: "var(--success)" }}>
            {t("saved")}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </form>

      <div className="grid gap-4">
        <CardTitle>{t("preview")}</CardTitle>
        <div>
          <p className="mb-1 text-sm text-muted">{t("mobile")}</p>
          <iframe
            key={`390-${frameGen}`}
            ref={iframe390}
            src="/admin/preview/theme"
            onLoad={broadcast}
            title={t("mobilePreview")}
            style={{
              width: 390,
              maxWidth: "100%",
              height: 420,
              border: "1px solid #ddd",
              borderRadius: 12,
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-muted">{t("desktop")}</p>
          <iframe
            key={`1280-${frameGen}`}
            ref={iframe1280}
            src="/admin/preview/theme"
            onLoad={broadcast}
            title={t("desktopPreview")}
            style={{
              width: "100%",
              height: 320,
              border: "1px solid #ddd",
              borderRadius: 12,
            }}
          />
        </div>
      </div>
    </div>
  );
}
