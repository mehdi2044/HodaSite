"use server";
import QRCode from "qrcode";
import { z } from "zod";
import { getAdminSession } from "@/modules/auth";
import {
  beginMfaEnrollment,
  finishMfaEnrollment,
} from "@/modules/auth/security";
import { db } from "@/lib/db";
// MFA enrollment has its own limited-session gate. Requiring an operational
// permission would either permit a setup-session bypass or lock out enrollment.
export async function setupMfaAction(form: FormData) {
  try {
    const session = await getAdminSession(true);
    if (!session) return { error: true as const };
    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
    });
    const brand = settings?.brand as { name?: string } | undefined;
    const input = z.string().min(8).max(256).parse(form.get("password"));
    const value = await beginMfaEnrollment(
      session.user.id,
      input,
      brand?.name ?? "Admin",
    );
    return {
      ...value,
      qr: await QRCode.toDataURL(value.uri, { width: 260, margin: 2 }),
    };
  } catch {
    return { error: true as const };
  }
}
export async function confirmMfaAction(form: FormData) {
  try {
    const session = await getAdminSession(true);
    if (!session) return { error: true as const };
    return {
      codes: await finishMfaEnrollment(
        session.user.id,
        z
          .string()
          .regex(/^\d{6}$/)
          .parse(form.get("token")),
      ),
    };
  } catch {
    return { error: true as const };
  }
}
