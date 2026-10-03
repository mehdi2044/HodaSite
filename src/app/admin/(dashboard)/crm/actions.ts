"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action-result";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { z } from "zod";
import {
  addNote,
  setTags,
  saveSegment,
  saveMetricsConfig,
  transitionPrivacy,
} from "@/modules/crm";
async function authorize(permission: string, f: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const marketId = z.string().min(1).max(100).parse(f.get("marketId"));
  await assertCan(session.user.id, permission, { marketId });
}
export async function noteAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await authorize("crm.customer.notes", f);
    await addNote({
      customerId: f.get("customerId"),
      marketId: f.get("marketId"),
      body: f.get("body"),
    });
    revalidatePath("/admin/crm");
  });
}
export async function tagsAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await authorize("crm.customer.tags", f);
    await setTags({
      customerId: f.get("customerId"),
      marketId: f.get("marketId"),
      tags: String(f.get("tags") ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    });
    revalidatePath("/admin/crm");
  });
}
export async function segmentAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await authorize("crm.segment.manage", f);
    const definition = z
      .string()
      .max(12000)
      .transform((v, ctx) => {
        try {
          return JSON.parse(v) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid definition" });
          return z.NEVER;
        }
      })
      .parse(f.get("definition"));
    await saveSegment({
      marketId: f.get("marketId"),
      ...(f.get("id")
        ? { id: f.get("id"), version: Number(f.get("version")) }
        : {}),
      name: f.get("name"),
      definition,
    });
    revalidatePath("/admin/crm");
  });
}
export async function metricsAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await authorize("crm.metrics.manage", f);
    await saveMetricsConfig({
      marketId: f.get("marketId"),
      definition: {
        name: f.get("name"),
        recencyDays: String(f.get("recencyDays")).split(",").map(Number),
        frequency: String(f.get("frequency")).split(",").map(Number),
        monetaryUsd: String(f.get("monetaryUsd"))
          .split(",")
          .map((v) => v.trim()),
        churnDays: Number(f.get("churnDays")),
      },
    });
    revalidatePath("/admin/crm");
  });
}
export async function privacyAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await authorize("crm.privacy.review", f);
    await transitionPrivacy({
      id: f.get("id"),
      marketId: f.get("marketId"),
      version: Number(f.get("version")),
      status: f.get("status"),
    });
    revalidatePath("/admin/crm");
  });
}
