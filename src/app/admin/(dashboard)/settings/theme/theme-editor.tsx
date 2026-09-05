"use client";
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

const LABELS: Record<string, string> = {
  primary: "اصلی",
  background: "پس‌زمینه",
  surface: "سطح",
  text: "متن",
  muted: "متن کم‌رنگ",
  success: "موفق",
  error: "خطا",
  warning: "هشدار",
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
        <Card>
          <CardTitle>پالت روشن</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="grid gap-1 text-sm">
                {LABELS[k]}
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
          <CardTitle>پالت تیره</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_KEYS.map((k) => (
              <label key={k} className="grid gap-1 text-sm">
                {LABELS[k]}
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
          <CardTitle>ظاهر</CardTitle>
          <label className="grid gap-1">
            حالت تیره
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
              <option value="off">خاموش</option>
              <option value="on">همیشه روشن</option>
              <option value="system">پیرو سیستم</option>
            </Select>
          </label>
          <label className="grid gap-1">
            سبک هدر
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
              <option value="minimal">مینیمال</option>
              <option value="centered">وسط‌چین</option>
              <option value="editorial">مجله‌ای</option>
            </Select>
          </label>
          <label className="grid gap-1">
            سبک دکمه
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
              <option value="pill">بیضی (pill)</option>
              <option value="soft">نرم</option>
              <option value="sharp">تیز</option>
            </Select>
          </label>
          <label className="grid gap-1">
            سبک قهرمان صفحه
            <Select
              name="heroStyle"
              value={draft.heroStyle}
              onChange={(e) =>
                setDraft((d) => ({ ...d, heroStyle: e.target.value }))
              }
            >
              <option value="editorial">مجله‌ای</option>
              <option value="minimal">مینیمال</option>
            </Select>
          </label>
          <label className="grid gap-1">
            گردی گوشه‌ها
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
          <CardTitle>فونت</CardTitle>
          <label className="grid gap-1">
            فونت فارسی
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
            فونت لاتین
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
          <CardTitle>CSS سفارشی</CardTitle>
          <textarea
            name="customCss"
            value={draft.customCss}
            onChange={(e) =>
              setDraft((d) => ({ ...d, customCss: e.target.value }))
            }
            rows={6}
            className="rounded-[10px] border border-black/15 p-3 font-mono text-sm"
            placeholder="حداکثر ۲۰ کیلوبایت. بدون @import یا url() بیرونی."
          />
        </Card>

        {state && !state.ok && (
          <p role="alert" style={{ color: "var(--error)" }}>
            {state.message}
          </p>
        )}
        {state?.ok && (
          <p role="status" style={{ color: "var(--success)" }}>
            ذخیره شد.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </form>

      <div className="grid gap-4">
        <CardTitle>پیش‌نمایش زنده</CardTitle>
        <div>
          <p className="mb-1 text-sm text-muted">۳۹۰px (موبایل)</p>
          <iframe
            key={`390-${frameGen}`}
            ref={iframe390}
            src="/admin/preview/theme"
            onLoad={broadcast}
            title="پیش‌نمایش موبایل"
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
          <p className="mb-1 text-sm text-muted">۱۲۸۰px (دسکتاپ)</p>
          <iframe
            key={`1280-${frameGen}`}
            ref={iframe1280}
            src="/admin/preview/theme"
            onLoad={broadcast}
            title="پیش‌نمایش دسکتاپ"
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
