/** An explicit existing Product.tags flag, controlled by the product editor. */
export const NEW_ARRIVAL_TAG = "merchandising:new";
export function hasNewArrival(tags?: string[]) {
  return tags?.includes(NEW_ARRIVAL_TAG) ?? false;
}
export function merchandisingTags(tags: string[], enabled?: boolean) {
  if (enabled === undefined) return tags;
  return [
    ...tags.filter((tag) => tag !== NEW_ARRIVAL_TAG),
    ...(enabled ? [NEW_ARRIVAL_TAG] : []),
  ];
}
