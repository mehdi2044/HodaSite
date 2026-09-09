import { z } from "zod";

export const NOTIFICATION_TEMPLATE_KEYS = [
  "auth.otp",
  "order.placed",
  "order.receipt_received",
  "order.paid",
  "order.rejected",
  "order.shipped",
  "order.delivered",
  "order.cancelled",
] as const;

export type NotificationTemplateKey =
  (typeof NOTIFICATION_TEMPLATE_KEYS)[number];
export type NotificationLocale = "fa" | "tr" | "en";

export const ALLOWED_TEMPLATE_VARIABLES: Record<
  NotificationTemplateKey,
  readonly string[]
> = {
  "auth.otp": ["code", "expiresMinutes"],
  "order.placed": ["customerName", "orderNumber", "total"],
  "order.receipt_received": ["customerName", "orderNumber"],
  "order.paid": ["customerName", "orderNumber", "total"],
  "order.rejected": ["customerName", "orderNumber", "reason"],
  "order.shipped": ["customerName", "orderNumber", "trackingNumber"],
  "order.delivered": ["customerName", "orderNumber"],
  "order.cancelled": ["customerName", "orderNumber", "reason"],
};

const localizedText = z.object({
  fa: z.string().trim().min(1).max(20_000),
  tr: z.string().trim().min(1).max(20_000),
  en: z.string().trim().min(1).max(20_000),
});

export const notificationTemplateInputSchema = z
  .object({
    id: z.string().min(1).max(100),
    key: z.enum(NOTIFICATION_TEMPLATE_KEYS),
    isActive: z.boolean(),
    subjectI18n: localizedText,
    bodyI18n: localizedText,
  })
  .superRefine((value, context) => {
    const allowed = new Set(ALLOWED_TEMPLATE_VARIABLES[value.key]);
    for (const [field, localized] of [
      ["subjectI18n", value.subjectI18n],
      ["bodyI18n", value.bodyI18n],
    ] as const) {
      for (const [locale, text] of Object.entries(localized)) {
        const withoutValidVariables = text.replace(
          /{{\s*[A-Za-z][A-Za-z0-9_]*\s*}}/g,
          "",
        );
        if (
          withoutValidVariables.includes("{{") ||
          withoutValidVariables.includes("}}")
        )
          context.addIssue({
            code: "custom",
            path: [field, locale],
            message: "malformed template variable",
          });
        for (const variable of extractVariables(text)) {
          if (!allowed.has(variable))
            context.addIssue({
              code: "custom",
              path: [field, locale],
              message: `unknown template variable: ${variable}`,
            });
        }
      }
    }
  });

export function extractVariables(text: string): string[] {
  return [...text.matchAll(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g)].map(
    (match) => match[1],
  );
}

export function renderTemplate(
  text: string,
  allowed: readonly string[],
  data: Record<string, string>,
): string {
  const allowedSet = new Set(allowed);
  return text.replace(
    /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g,
    (_match, variable: string) =>
      allowedSet.has(variable) ? (data[variable] ?? `[${variable}]`) : "",
  );
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  templateKey: NotificationTemplateKey;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

class NoopEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<{ id: string }> {
    // Never log recipient, rendered body, variables, or configuration.
    console.info("[email:noop] accepted", { templateKey: message.templateKey });
    return { id: "noop" };
  }
}

class Phase04EmailProvider implements EmailProvider {
  constructor(private readonly name: "smtp" | "resend") {}
  async send(): Promise<{ id: string }> {
    throw new Error(`${this.name} delivery is configured in Phase 04`);
  }
}

export function getEmailProvider(
  name = process.env.EMAIL_PROVIDER ?? "noop",
): EmailProvider {
  if (name === "noop") return new NoopEmailProvider();
  if (name === "smtp" || name === "resend")
    return new Phase04EmailProvider(name);
  throw new Error("Unsupported EMAIL_PROVIDER");
}
