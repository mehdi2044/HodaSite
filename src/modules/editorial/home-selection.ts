type LookReference = {
  id: string;
  visual?: {
    mode: string;
    desktop?: { id: string };
    mobile?: { id: string };
  } | null;
};

function photographedMedia(look: LookReference) {
  return look.visual?.mode === "PHOTO"
    ? [look.visual.desktop?.id, look.visual.mobile?.id].filter(
        (id): id is string => Boolean(id),
      )
    : [];
}

/** Keep CMS order, reserving both portrait and wide photo identities. Never fills gaps. */
export function selectHomepageLooks<T extends LookReference>(
  ids: readonly string[],
  entries: readonly T[],
  excludedIds: readonly string[] = [],
) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const usedIds = new Set(excludedIds);
  const usedMedia = new Set(
    excludedIds.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? photographedMedia(entry) : [];
    }),
  );
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry || usedIds.has(id)) return [];
    const media = photographedMedia(entry);
    if (media.some((id) => usedMedia.has(id))) return [];
    usedIds.add(id);
    media.forEach((id) => usedMedia.add(id));
    return [entry];
  });
}
