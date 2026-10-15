"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveCustomerPresentation } from "@/modules/customers/presentation";
import { CommerceError } from "@/modules/orders/state";
import { MaintenanceError } from "@/lib/mutation-gate";
export async function savePresentationAction(locale: string, form: FormData) {
  try {
    const safe = z.enum(["fa", "tr", "en"]).parse(locale);
    const clear = form.get("intent") === "clear";
    if (clear && form.get("confirmClear") !== "on")
      throw new CommerceError("VALIDATION");
    const saved = await saveCustomerPresentation({
      expectedVersion: z.coerce
        .number()
        .int()
        .parse(form.get("expectedVersion")),
      theme: form.get("theme") || null,
      sizeIds: form.getAll("sizeIds"),
      categoryIds: form.getAll("categoryIds"),
      clear,
    });
    revalidatePath(`/${safe}/account`);
    return { ok: true, version: saved.version };
  } catch (error) {
    return {
      error:
        error instanceof CommerceError
          ? error.code
          : error instanceof z.ZodError
            ? "VALIDATION"
            : error instanceof MaintenanceError
              ? "MAINTENANCE"
              : "REQUEST_FAILED",
    };
  }
}
