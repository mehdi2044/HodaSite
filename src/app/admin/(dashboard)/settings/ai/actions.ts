"use server";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AiError } from "@/modules/ai/contracts";
import { sessionActor } from "@/modules/ai/access";
import {
  assertCan,
  type Scope,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import {
  generateProduct,
  applyProposal,
  discardDraft,
} from "@/modules/ai/products";
import { saveAiSettings } from "@/modules/ai/settings";
import { financialSummary } from "@/modules/ai/financial";
import { queueProducts } from "@/modules/ai/worker";
export type AiResult<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string };
async function action<T>(
  permission: string,
  fn: () => Promise<T>,
  scope: Scope = {},
): Promise<AiResult<T>> {
  try {
    await assertCan(await sessionActor(), permission, scope);
    return { ok: true, value: await fn() };
  } catch (error) {
    const code =
      error instanceof AiError
        ? error.code
        : error instanceof ForbiddenError
          ? "FORBIDDEN"
          : error instanceof UnauthorizedError
            ? "UNAUTHORIZED"
            : error instanceof MaintenanceError
              ? "MAINTENANCE"
              : error instanceof ZodError
                ? "INPUT"
                : "UNKNOWN";
    const t = await getTranslations("aiAdmin");
    return {
      ok: false,
      code,
      message: t.has(`errors.${code}`)
        ? t(`errors.${code}`)
        : t("errors.UNKNOWN"),
    };
  }
}
export async function generateAi(raw: unknown) {
  return action("ai.product.generate", () => generateProduct(raw));
}
export async function applyAi(raw: unknown) {
  return action("ai.product.generate", async () => {
    const id = await applyProposal(raw);
    try {
      revalidatePath("/admin/catalog/products");
      revalidatePath(`/admin/catalog/products/${id}`);
      revalidatePath("/admin/ai/review");
      revalidatePath("/[locale]", "layout");
    } catch {}
    return id;
  });
}
export async function discardAi(id: string) {
  return action("ai.product.generate", () => discardDraft(id));
}
export async function saveAi(raw: unknown) {
  return action("ai.settings.manage", () => saveAiSettings(raw));
}
export async function queueAi(raw: unknown) {
  return action("ai.product.generate", () => queueProducts(raw));
}
export async function analyzeAi(raw: unknown) {
  const scope =
    raw &&
    typeof raw === "object" &&
    "marketId" in raw &&
    typeof raw.marketId === "string"
      ? { marketId: raw.marketId }
      : {};
  return action("ai.finance.analyze", () => financialSummary(raw), scope);
}
