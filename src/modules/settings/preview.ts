import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/** Operational preview metadata; never a business setting or credential. */
export function previewEnabled() {
  return process.env.HODASITE_PREVIEW === "1";
}

export async function getPreviewStatus() {
  // Read uncached committed revisions, not the storefront's cached settings.
  // Presentation/model/media revisions also refresh an open operator catalog;
  // live scene prices use their own current-market resolver/polling.
  const revisions = await Promise.all([
    db.siteSettings.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.themeSettings.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.homepage.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.menu.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.menuItem.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.category.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.catalogCutout.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.media.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.integration.aggregate({ _max: { updatedAt: true }, _count: true }),
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
