import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  editorialContent,
  slugPattern,
  type EditorialKind,
  type EditorialLocale,
} from "./contracts";
import { resolveLookVisuals } from "./visual";

type Entry = NonNullable<ReturnType<typeof parsePublicEntry>>;

async function withValidVisuals(
  entries: Entry[],
  marketId: string,
  client: Prisma.TransactionClient,
) {
  const looks = entries.flatMap(({ body }) =>
    body.kind === "LOOK" ? [body] : [],
  );
  const visuals = await resolveLookVisuals(looks, [marketId], client);
  let index = 0;
  return entries.flatMap((entry) => {
    const visual = entry.body.kind === "LOOK" ? visuals[index++] : null;
    return entry.body.kind === "LOOK" && !visual ? [] : [{ ...entry, visual }];
  });
}

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
  const parsed = entry && parsePublicEntry(entry, marketId);
  if (!parsed) return null;
  const [result] = await withValidVisuals([parsed], marketId, client);
  return result ?? null;
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
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug).normalize("NFC");
  } catch {
    return null;
  }
  if (decoded.length > 96 || !slugPattern.test(decoded)) return null;
  return publishedEntry(kind, { [slugKeys[locale]]: decoded }, marketId);
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
  const parsed = entries.flatMap((entry) => {
    const parsed = parsePublicEntry(entry, marketId);
    return parsed ? [parsed] : [];
  });
  return withValidVisuals(parsed, marketId, db);
}

export function readyImages(ids: string[]) {
  return db.media.findMany({
    where: { id: { in: ids }, status: "READY", kind: "image", deletedAt: null },
  });
}
