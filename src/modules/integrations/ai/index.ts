import { z } from "zod";
import {
  AiError,
  type AiProvider,
  type CompletionInput,
  type ProviderName,
} from "@/modules/ai/contracts";
export function keyStatus() {
  return {
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
}
function secret(name: ProviderName) {
  const key =
    name === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : name === "openai"
        ? process.env.OPENAI_API_KEY
        : process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("KEY_MISSING", true);
  return key;
}
const object = z.record(z.string(), z.unknown());
const tokens = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
function sum(a: number | null, b: number | null) {
  return a === null || b === null ? null : a + b;
}
async function post(
  provider: ProviderName,
  path: string,
  body: unknown,
  signal: AbortSignal,
) {
  const host = {
    openai: "https://api.openai.com/v1/",
    anthropic: "https://api.anthropic.com/v1/",
    gemini: "https://generativelanguage.googleapis.com/v1beta/",
  }[provider];
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (provider === "openai")
    headers.authorization = `Bearer ${secret(provider)}`;
  else if (provider === "gemini") headers["x-goog-api-key"] = secret(provider);
  else {
    headers["x-api-key"] = secret(provider);
    headers["anthropic-version"] = "2023-06-01";
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(host + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new AiError(signal.aborted ? "TIMEOUT" : "NETWORK_UNKNOWN");
    }
    if (response.status === 429 && attempt === 0 && !signal.aborted) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AiError(
        response.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR",
        [400, 401, 403, 404, 429].includes(response.status),
      );
    }
    // Never include provider error bodies, headers or keys in logs/UI.
    const reader = response.body?.getReader();
    if (!reader) throw new AiError("INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new AiError("INVALID_RESPONSE");
        }
        chunks.push(next.value);
      }
      return object.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new AiError(signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE");
    }
  }
  throw new AiError("RATE_LIMIT", true);
}
const list = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => object.parse(x)) : [];
const rec = (v: unknown) => object.parse(v ?? {});
// The raw Anthropic API rejects these Zod-generated constraints. Keep them in
// descriptions for generation; completeTask still validates the original Zod schema.
// https://platform.claude.com/docs/en/build-with-claude/structured-outputs
function anthropicSchema(schema: Record<string, unknown>) {
  const unsupported = new Set([
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "maxItems",
    "uniqueItems",
  ]);
  function visit(value: unknown, propertyMap = false): unknown {
    if (Array.isArray(value)) return value.map((v) => visit(v));
    if (!value || typeof value !== "object") return value;
    const result: Record<string, unknown> = {},
      constraints: string[] = [];
    for (const [key, item] of Object.entries(value)) {
      if (
        !propertyMap &&
        (unsupported.has(key) ||
          (key === "minItems" && item !== 0 && item !== 1))
      ) {
        constraints.push(`${key}: ${String(item)}`);
      } else if (!propertyMap && key === "$schema") {
        continue;
      } else
        result[key] = visit(
          item,
          !propertyMap && ["properties", "$defs", "definitions"].includes(key),
        );
    }
    if (constraints.length)
      result.description = [
        result.description,
        `Constraints: ${constraints.join("; ")}.`,
      ]
        .filter(Boolean)
        .join(" ");
    return result;
  }
  return visit(schema) as Record<string, unknown>;
}
export function provider(name: ProviderName): AiProvider {
  return {
    async complete(i: CompletionInput) {
      const imageParts = i.images ?? [];
      if (name === "openai") {
        const r = await post(
          name,
          "responses",
          {
            model: i.model,
            store: false,
            instructions: i.system,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: i.data },
                  ...imageParts.map((im) => ({
                    type: "input_image",
                    image_url: `data:${im.mime};base64,${im.base64}`,
                    detail: "low",
                  })),
                ],
              },
            ],
            max_output_tokens: i.maxOutputTokens,
            text: {
              format: {
                type: "json_schema",
                name: "hoda_proposal",
                strict: true,
                schema: i.schema,
              },
            },
          },
          i.signal,
        );
        const u = rec(r.usage);
        return {
          text: list(r.output)
            .flatMap((o) => list(o.content))
            .filter((c) => c.type === "output_text")
            .map((c) => String(c.text ?? ""))
            .join(""),
          inputTokens: tokens(u.input_tokens),
          outputTokens: tokens(u.output_tokens),
          complete: r.status === "completed",
        };
      }
      if (name === "anthropic") {
        const r = await post(
          name,
          "messages",
          {
            model: i.model,
            max_tokens: i.maxOutputTokens,
            system: i.system,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: i.data },
                  ...imageParts.map((im) => ({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: im.mime,
                      data: im.base64,
                    },
                  })),
                ],
              },
            ],
            output_config: {
              format: {
                type: "json_schema",
                schema: anthropicSchema(i.schema),
              },
            },
          },
          i.signal,
        );
        const u = rec(r.usage);
        return {
          text: list(r.content)
            .filter((c) => c.type === "text")
            .map((c) => String(c.text ?? ""))
            .join(""),
          inputTokens: sum(
            tokens(u.input_tokens),
            sum(
              tokens(u.cache_read_input_tokens ?? 0),
              tokens(u.cache_creation_input_tokens ?? 0),
            ),
          ),
          outputTokens: tokens(u.output_tokens),
          complete: r.stop_reason === "end_turn",
        };
      }
      const r = await post(
        name,
        `models/${encodeURIComponent(i.model)}:generateContent`,
        {
          systemInstruction: { parts: [{ text: i.system }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: i.data },
                ...imageParts.map((im) => ({
                  inlineData: { mimeType: im.mime, data: im.base64 },
                })),
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: i.maxOutputTokens,
            responseMimeType: "application/json",
            responseJsonSchema: i.schema,
          },
        },
        i.signal,
      );
      const c = list(r.candidates)[0] ?? {},
        u = rec(r.usageMetadata);
      return {
        text: list(rec(c.content).parts)
          .filter((p) => !p.thought)
          .map((p) => String(p.text ?? ""))
          .join(""),
        inputTokens: tokens(u.promptTokenCount),
        outputTokens: sum(
          tokens(u.candidatesTokenCount),
          tokens(u.thoughtsTokenCount ?? 0),
        ),
        complete: c.finishReason === "STOP",
      };
    },
    async embed(i) {
      if (name === "anthropic") throw new AiError("EMBED_UNSUPPORTED", true);
      if (
        i.texts.length < 1 ||
        i.texts.length > 32 ||
        i.texts.some((t) => Buffer.byteLength(t) > 16000)
      )
        throw new AiError("INPUT", true);
      const vector = z.array(z.number().finite()).min(1).max(10000);
      if (name === "openai") {
        const r = await post(
          name,
          "embeddings",
          { model: i.model, input: i.texts, encoding_format: "float" },
          i.signal,
        );
        const rows = list(r.data).sort(
          (a, b) => Number(a.index) - Number(b.index),
        );
        if (rows.length !== i.texts.length)
          throw new AiError("INVALID_RESPONSE");
        return {
          vectors: rows.map((r) => vector.parse(r.embedding)),
          inputTokens: tokens(rec(r.usage).prompt_tokens),
        };
      }
      const r = await post(
        name,
        `models/${encodeURIComponent(i.model)}:batchEmbedContents`,
        {
          requests: i.texts.map((text) => ({
            model: `models/${i.model}`,
            content: { parts: [{ text }] },
          })),
        },
        i.signal,
      );
      const rows = list(r.embeddings);
      if (rows.length !== i.texts.length) throw new AiError("INVALID_RESPONSE");
      return {
        vectors: rows.map((r) => vector.parse(r.values)),
        inputTokens: null,
      };
    },
  };
}
