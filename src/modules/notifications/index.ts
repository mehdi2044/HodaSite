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
  "auth.otp": ["code", "expiresMinutes", "loginUrl"],
  "order.placed": [
    "customerName",
    "orderNumber",
    "total",
    "paymentUrl",
    "holdUntil",
    "deadline",
    "bankDetails",
  ],
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
  idempotencyKey?: string;
  fromName?: string;
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

class SmtpEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const { default: nodemailer } = await import("nodemailer");
    if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM)
      throw new Error("SMTP configuration required");
    const local = ["mailpit", "localhost", "127.0.0.1"].includes(
      process.env.SMTP_HOST,
    );
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: !local,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
    const result = await transport.sendMail({
      from: { name: message.fromName ?? "", address: process.env.EMAIL_FROM },
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.idempotencyKey
        ? {
            messageId: `<${message.idempotencyKey}@${process.env.EMAIL_FROM.split("@")[1]}>`,
          }
        : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (result.rejected?.length) throw new Error("EMAIL_DELIVERY_FAILED");
    return { id: result.messageId };
  }
}
class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
      throw new Error("Resend configuration required");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey
          ? { "Idempotency-Key": message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: message.fromName
          ? `"${message.fromName.replace(/[\r\n"\\]/g, " ")}" <${process.env.EMAIL_FROM}>`
          : process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
    return z.object({ id: z.string() }).parse(await response.json());
  }
}

export function getEmailProvider(
  name = process.env.EMAIL_PROVIDER ?? "noop",
): EmailProvider {
  if (name === "noop") return new NoopEmailProvider();
  if (name === "smtp") return new SmtpEmailProvider();
  if (name === "resend") return new ResendEmailProvider();
  throw new Error("Unsupported EMAIL_PROVIDER");
}

export {
  queueEmail,
  registerNotificationJobs,
  NoopSmsProvider,
} from "./delivery";
