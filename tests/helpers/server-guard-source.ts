/** Cheap candidate filter only; TypeScript still decides what is a guard call.
 * Escaped identifiers can spell a guard without containing its plain name.
 * Parse every file containing a Unicode escape rather than risk missing one.
 */
export const SERVER_GUARD_NAMES: readonly string[] = [
  "can",
  "assertCan",
  "requireAdminPage",
  "authorizedMarketIds",
];
const candidate = new RegExp(`\\b(?:${SERVER_GUARD_NAMES.join("|")})\\b|\\\\u`);
export function mayContainServerGuard(source: string) {
  return candidate.test(source);
}
