type LookReference = {
  id: string;
  visual?: {
    mode: string;
    pieces?: readonly { image?: { id: string } }[];
    desktop?: { id: string };
    mobile?: { id: string };
  } | null;
};

export function homepageLookPhotoIds(look: LookReference) {
  return look.visual?.mode === "PHOTO"
    ? [look.visual.desktop?.id, look.visual.mobile?.id].filter(
        (id): id is string => Boolean(id),
      )
    : [];
}

export function homepageVisualIdentity(look: LookReference) {
  if (look.visual?.mode === "PHOTO")
    return "PHOTO:" + [...new Set(homepageLookPhotoIds(look))].sort().join(",");
  const ids =
    look.visual?.pieces?.flatMap((piece) =>
      piece.image ? [piece.image.id] : [],
    ) ?? [];
  return ids.length ? "COMPOSITE:" + ids.sort().join(",") : undefined;
}

/** Keep CMS order, reserving both portrait and wide photo identities. Never fills gaps. */
export function selectHomepageLooks<T extends LookReference>(
  ids: readonly string[],
  entries: readonly T[],
  excludedIds: readonly string[] = [],
  excludedMediaIds: readonly string[] = [],
) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const usedIds = new Set(excludedIds);
  const usedCompositions = new Set(
    excludedIds.flatMap((id) => {
      const look = byId.get(id);
      const identity =
        look?.visual?.mode === "COMPOSITE"
          ? homepageVisualIdentity(look)
          : undefined;
      return identity ? [identity] : [];
    }),
  );
  const usedMedia = new Set([
    ...excludedMediaIds,
    ...excludedIds.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? homepageLookPhotoIds(entry) : [];
    }),
  ]);
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry || usedIds.has(id)) return [];
    const composition =
      entry.visual?.mode === "COMPOSITE"
        ? homepageVisualIdentity(entry)
        : undefined;
    if (composition && usedCompositions.has(composition)) return [];
    const media = homepageLookPhotoIds(entry);
    if (media.some((id) => usedMedia.has(id))) return [];
    usedIds.add(id);
    if (composition) usedCompositions.add(composition);
    media.forEach((id) => usedMedia.add(id));
    return [entry];
  });
}

type ArticleReference = {
  id: string;
  body: {
    mediaId: string;
    mobileMediaId?: string;
    featured: boolean;
    blocks: readonly { type: string; id?: string }[];
  };
};
/** A missing/duplicate explicit selection stays empty; automatic mode chooses a real eligible story. */
export function chooseHomepageArticle<T extends ArticleReference>(
  entries: readonly T[],
  requestedId: string | undefined,
  excludedTopicLookIds: readonly string[],
  excludedPhotoIds: readonly string[],
) {
  const topics = new Set(excludedTopicLookIds),
    photos = new Set(excludedPhotoIds);
  const eligible = entries.filter((entry) => {
    const primaryLook = entry.body.blocks.find(
      (block) => block.type === "LOOK",
    )?.id;
    return (
      !(primaryLook && topics.has(primaryLook)) &&
      ![entry.body.mediaId, entry.body.mobileMediaId].some(
        (id) => id && photos.has(id),
      )
    );
  });
  return requestedId
    ? eligible.find((entry) => entry.id === requestedId)
    : (eligible.find((entry) => entry.body.featured) ?? eligible[0]);
}
