"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, ForbiddenError, UnauthorizedError } from "@/modules/access";
import { saveWorkflow } from "@/modules/shipping/workflows";
import {
  createShipment,
  changeShipment,
  shippingOrder,
} from "@/modules/shipping/service";
import { ShippingError } from "@/modules/shipping/validation";
function errorResult(error: unknown) {
  if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
    throw error;
  return {
    error: error instanceof ShippingError ? error.code : "REQUEST_FAILED",
  };
}
export async function workflowAction(form: FormData) {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const marketId = z.string().min(1).max(100).parse(form.get("marketId"));
    await assertCan(userId, "shipping.workflow.manage", { marketId });
    const id = await saveWorkflow(userId, {
      id: form.get("id") || undefined,
      marketId,
      version: form.get("version") ?? 0,
      isDefault: form.get("isDefault") === "on",
      isActive: form.get("isActive") === "on",
      nameI18n: {
        fa: form.get("nameFa"),
        tr: form.get("nameTr"),
        en: form.get("nameEn"),
      },
      legs: JSON.parse(z.string().max(16000).parse(form.get("legs"))),
    });
    revalidatePath("/admin/settings/shipping");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}
export async function shipmentAction(form: FormData) {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const orderId = z.string().min(1).max(100).parse(form.get("orderId"));
    const order = await shippingOrder(userId, orderId);
    await assertCan(userId, "order.shipment.manage", {
      marketId: order.marketId,
    });
    const operation = z
      .enum([
        "create",
        "saveLeg",
        "addLeg",
        "cancelLeg",
        "cancelShipment",
        "event",
      ])
      .parse(form.get("operation"));
    if (operation === "create") {
      const items = Array.from(form.entries())
        .filter(
          ([key, value]) =>
            key.startsWith("qty:") &&
            String(value) !== "0" &&
            String(value) !== "",
        )
        .map(([key, quantity]) => ({ orderItemId: key.slice(4), quantity }));
      await createShipment(
        userId,
        orderId,
        items,
        String(form.get("workflowId") || "") || undefined,
      );
    } else {
      if (operation === "event" && typeof form.get("at") === "string")
        form.set("at", String(form.get("at")) + ":00Z");
      await changeShipment(
        userId,
        orderId,
        z.string().min(1).max(100).parse(form.get("shipmentId")),
        z.coerce.number().int().min(0).parse(form.get("version")),
        operation,
        {
          ...Object.fromEntries(form),
          labelI18n: {
            fa: form.get("labelFa"),
            tr: form.get("labelTr"),
            en: form.get("labelEn"),
          },
        },
      );
    }
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (error) {
    return errorResult(error);
  }
}
