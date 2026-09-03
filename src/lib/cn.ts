/** Minimal class-name join. The ui set owns its own classes, so full
 *  tailwind-merge conflict resolution isn't needed here. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
