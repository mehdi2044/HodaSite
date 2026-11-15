import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  editorialContent,
  type EditorialKind,
  type EditorialLocale,
} from "./contracts";

export const revisionQuery = (now: Date) => ({
  where: { visibleFrom: { lte: now } },
  orderBy: { number: "desc" as const },
  take: 1,
});

const slugKeys = { fa: "slugFa", tr: "slugTr", en: "slugEn" } as const;
export function editorialSlug(
  entry: { slugFa: string; slugTr: string; slugEn: string },
  locale: EditorialLocale,
) {
  return entry[slugKeys[locale]];
}

export async function publishedEntry(
  kind: EditorialKind,
  where: Prisma.EditorialEntryWhereInput,
  marketId: string,
  client: Prisma.TransactionClient = db,
  now = new Date(),
) {
  const entry = await client.editorialEntry.findFirst({
    where: { ...where, kind, deletedAt: null },
    include: { revisions: revisionQuery(now) },
  });
  return entry ? parsePublicEntry(entry, marketId) : null;
}

function parsePublicEntry(
  entry: Prisma.EditorialEntryGetPayload<{ include: { revisions: true } }>,
  marketId: string,
) {
  const revision = entry.revisions[0];
  if (!revision || revision.number < entry.minVisibleVersion) return null;
  const body = editorialContent.safeParse(revision.body);
  if (
    !body.success ||
    (body.data.marketIds.length && !body.data.marketIds.includes(marketId))
  )
    return null;
  const { revisions: _revisions, ...identity } = entry;
  return { ...identity, revision, body: body.data };
}

export async function publishedBySlug(
  kind: EditorialKind,
  locale: EditorialLocale,
  slug: string,
  marketId: string,
) {
  return publishedEntry(kind, { [slugKeys[locale]]: slug }, marketId);
}

export async function publishedEntries(kind: EditorialKind, marketId: string) {
  const now = new Date();
  const entries = await db.editorialEntry.findMany({
    where: {
      kind,
      deletedAt: null,
      revisions: { some: revisionQuery(now).where },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { revisions: revisionQuery(now) },
  });
  return entries.flatMap((entry) => {
    const parsed = parsePublicEntry(entry, marketId);
    return parsed ? [parsed] : [];
  });
}

export function readyImages(ids: string[]) {
  return db.media.findMany({
    where: { id: { in: ids }, status: "READY", kind: "image", deletedAt: null },
  });
}
