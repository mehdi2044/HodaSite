import { z } from "zod";
import Decimal from "decimal.js";
export const providers = ["gemini", "openai", "anthropic"] as const;
export const features = ["product", "finance"] as const;
export type ProviderName = (typeof providers)[number];
export type Feature = (typeof features)[number];
export const usd = z.string().regex(/^\d{1,8}(\.\d{1,4})?$/);
const model = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/),
    inputUsd: usd,
    outputUsd: usd,
  })
  .strict();
export const configSchema = z
  .object({
    provider: z.enum(providers),
    enabled: z.boolean(),
    product: z.boolean(),
    finance: z.boolean(),
    vision: z.boolean(),
    cheap: model,
    smart: model,
    productTier: z.enum(["cheap", "smart"]),
    financeTier: z.enum(["cheap", "smart"]),
    softUsd: usd,
    hardUsd: usd,
    concurrency: z.number().int().min(1).max(5),
    maxOutputTokens: z.number().int().min(512).max(8000),
  })
  .strict()
  .refine((v) => new Decimal(v.softUsd).lte(v.hardUsd), { path: ["softUsd"] })
  .refine(
    (v) =>
      !v.enabled ||
      (new Decimal(v.hardUsd).gt(0) &&
        [v.cheap, v.smart].every(
          (m) =>
            new Decimal(m.inputUsd).gt(0) && new Decimal(m.outputUsd).gt(0),
        )),
  );
export type AiConfig = z.infer<typeof configSchema>;
export const defaultConfig: AiConfig = {
  provider: "gemini",
  enabled: false,
  product: false,
  finance: false,
  vision: false,
  cheap: { name: "configure-model", inputUsd: "0", outputUsd: "0" },
  smart: { name: "configure-model", inputUsd: "0", outputUsd: "0" },
  productTier: "cheap",
  financeTier: "smart",
  softUsd: "5",
  hardUsd: "10",
  concurrency: 2,
  maxOutputTokens: 6000,
};
export type ImageInput = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};
export type CompletionInput = {
  model: string;
  system: string;
  data: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  images?: ImageInput[];
  signal: AbortSignal;
};
export type Completion = {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  complete: boolean;
};
export interface AiProvider {
  complete(input: CompletionInput): Promise<Completion>;
  embed(input: {
    model: string;
    texts: string[];
    signal: AbortSignal;
  }): Promise<{ vectors: number[][]; inputTokens: number | null }>;
}
export class AiError extends Error {
  constructor(
    public code: string,
    public knownRejected = false,
  ) {
    super(code);
  }
}
