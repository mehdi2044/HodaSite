"use server";
import { headers } from "next/headers";
import { getClientIp } from "@/lib/net";
import { findPublicTracking } from "@/modules/shipping/tracking";
export async function publicTrackingAction(form: FormData) {
  try {
    return {
      tracking: await findPublicTracking(
        Object.fromEntries(form),
        getClientIp(await headers()) ?? "unknown",
      ),
    };
  } catch {
    return { tracking: null };
  }
}
