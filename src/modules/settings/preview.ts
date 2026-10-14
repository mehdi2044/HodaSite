import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/** Operational preview metadata; never a business setting or credential. */
export function previewEnabled() {
  return process.env.HODASITE_PREVIEW === "1";
}

export async function getPreviewStatus() {
  // Read uncached committed revisions, not the storefront's cached settings.
  // Catalog/scene revision propagation belongs to R3, not this R0 foundation.
  const revisions = await Promise.all([
    db.siteSettings.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.themeSettings.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.homepage.aggregate({ _max: { updatedAt: true }, _count: true }),
  ]);
  return {
    buildSha: process.env.HODASITE_BUILD_SHA ?? "unknown",
    builtAt: process.env.HODASITE_BUILD_AT ?? "unknown",
    contentRevision: createHash("sha256")
      .update(JSON.stringify(revisions))
      .digest("hex")
      .slice(0, 16),
  };
}
