import { unstable_cache } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import fa from "../../../messages/fa.json";
import tr from "../../../messages/tr.json";
import en from "../../../messages/en.json";

export const UI_LOCALES = ["fa", "tr", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
type Messages = Record<string, unknown>;
const defaults: Record<UiLocale, Messages> = { fa, tr, en };
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const MAX_VALUE = 20_000;
export const MAX_IMPORT_BYTES = 1_000_000;

export function isSafeMessageKey(key: string): boolean {
  const parts = key.split(".");
  return (
    key.length > 0 &&
    key.length <= 300 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        !FORBIDDEN.has(part) &&
        /^[A-Za-z0-9_-]+$/.test(part),
    )
  );
}

export function flattenMessages(
  input: unknown,
  prefix = "",
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [part, value] of Object.entries(input)) {
    if (FORBIDDEN.has(part) || !/^[A-Za-z0-9_-]+$/.test(part)) continue;
    const key = prefix ? `${prefix}.${part}` : part;
    if (typeof value === "string") out[key] = value;
    else Object.assign(out, flattenMessages(value, key));
  }
  return out;
}

const flattenedDefaults = Object.fromEntries(
  UI_LOCALES.map((locale) => [locale, flattenMessages(defaults[locale])]),
) as Record<UiLocale, Record<string, string>>;
const allowedKeys = new Set(
  UI_LOCALES.flatMap((locale) => Object.keys(flattenedDefaults[locale])),
);

export function isAllowedUiKey(key: string): boolean {
  return isSafeMessageKey(key) && allowedKeys.has(key);
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map((match) => match[1])
    .sort();
}

export function isValidUiOverride(
  locale: UiLocale,
  key: string,
  value: string,
): boolean {
  if (value.length > MAX_VALUE || !isAllowedUiKey(key)) return false;
  const withoutPlaceholders = value.replace(/\{[A-Za-z0-9_]+\}/g, "");
  if (/[{}]/.test(withoutPlaceholders)) return false;
  return (
    placeholders(value).join("\0") ===
    placeholders(flattenedDefaults[locale][key] ?? "").join("\0")
  );
}

export const uiTranslationKeySchema = z.object({
  locale: z.enum(UI_LOCALES),
  key: z.string().refine(isAllowedUiKey, "unknown_ui_key"),
});

export const uiTranslationSchema = uiTranslationKeySchema
  .extend({
    value: z.string().max(MAX_VALUE),
  })
  .refine(
    (input) => isValidUiOverride(input.locale, input.key, input.value),
    "invalid_message_format",
  );

const importLocaleValues = z.record(z.string(), z.string().max(MAX_VALUE));
export const translationImportSchema = z
  .object({
    fa: importLocaleValues.optional(),
    tr: importLocaleValues.optional(),
    en: importLocaleValues.optional(),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    for (const [locale, values] of Object.entries(bundle)) {
      if (!values) continue;
      for (const [key, value] of Object.entries(values)) {
        if (!isAllowedUiKey(key))
          ctx.addIssue({ code: "custom", message: "unknown_ui_key" });
        else if (!isValidUiOverride(locale as UiLocale, key, value))
          ctx.addIssue({ code: "custom", message: "invalid_message_format" });
      }
    }
  });

const overrideLoaders = Object.fromEntries(
  UI_LOCALES.map((locale) => [
    locale,
    unstable_cache(
      async () =>
        db.translation.findMany({
          where: { entityType: "ui", entityId: "global", locale },
          select: { field: true, value: true },
        }),
      ["ui-translation-overrides", locale],
      { tags: ["ui-translations", `ui-translations:${locale}`] },
    ),
  ]),
) as Record<UiLocale, () => Promise<{ field: string; value: string }[]>>;

function deepClone(input: unknown): Messages {
  return JSON.parse(JSON.stringify(input)) as Messages;
}

function setMessage(target: Messages, key: string, value: string): void {
  if (!isAllowedUiKey(key)) return;
  const parts = key.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (FORBIDDEN.has(part)) return;
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    cursor = next as Messages;
  }
  const leaf = parts.at(-1);
  if (!leaf || FORBIDDEN.has(leaf) || typeof cursor[leaf] !== "string") return;
  cursor[leaf] = value;
}

export async function getRuntimeMessages(locale: UiLocale): Promise<Messages> {
  const messages = deepClone(defaults[locale]);
  try {
    const overrides = await overrideLoaders[locale]();
    for (const override of overrides)
      if (isValidUiOverride(locale, override.field, override.value))
        setMessage(messages, override.field, override.value);
  } catch {
    // Builds and first boot must remain usable if PostgreSQL is unavailable.
    // File defaults are the fail-safe source of truth.
  }
  return messages;
}

export function getUiTranslationRows() {
  return [...allowedKeys].sort().map((key) => ({
    key,
    defaults: Object.fromEntries(
      UI_LOCALES.map((locale) => [
        locale,
        flattenedDefaults[locale][key] ?? "",
      ]),
    ) as Record<UiLocale, string>,
  }));
}

export function parseTranslationImport(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > MAX_IMPORT_BYTES)
    throw new z.ZodError([]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new z.ZodError([]);
  }
  return translationImportSchema.parse(parsed);
}
