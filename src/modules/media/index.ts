import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type MediaListFilters = {
  q?: string;
  folderId?: string | null;
  kind?: string;
  status?: "PROCESSING" | "READY" | "FAILED";
  tag?: string;
  trash?: boolean;
  sort?: "date_desc" | "date_asc" | "name_asc" | "size_desc";
  skip?: number;
  take?: number;
};

const SORT: Record<
  NonNullable<MediaListFilters["sort"]>,
  Prisma.MediaOrderByWithRelationInput
> = {
  date_desc: { createdAt: "desc" },
  date_asc: { createdAt: "asc" },
  name_asc: { originalName: "asc" },
  size_desc: { bytes: "desc" },
};

/**
 * Shared listing query behind both the admin grid (SSR, filters via
 * searchParams) and the MediaPicker's client-side search (via
 * /api/admin/media) — one place owns "what admin.media search means".
 */
export async function listMedia(filters: MediaListFilters = {}) {
  const where: Prisma.MediaWhereInput = {
    deletedAt: filters.trash ? { not: null } : null,
  };
  if (filters.q) {
    where.OR = [
      { originalName: { contains: filters.q, mode: "insensitive" } },
      { tags: { has: filters.q } },
    ];
  }
  if (filters.folderId) where.folderId = filters.folderId;
  if (filters.kind) where.kind = filters.kind;
  if (filters.status) where.status = filters.status;
  if (filters.tag) where.tags = { has: filters.tag };

  const [items, total] = await Promise.all([
    db.media.findMany({
      where,
      orderBy: SORT[filters.sort ?? "date_desc"],
      skip: filters.skip ?? 0,
      take: filters.take ?? 60,
      include: { folder: true },
    }),
    db.media.count({ where }),
  ]);
  return { items, total };
}

export async function getFolders() {
  return db.mediaFolder.findMany({ orderBy: { name: "asc" } });
}
