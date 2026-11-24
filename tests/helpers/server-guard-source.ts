/** Cheap candidate filter only; TypeScript still decides what is a guard call.
 * Escaped identifiers can spell a guard without containing its plain name.
 * Parse every file containing a Unicode escape rather than risk missing one.
 */
export function mayContainServerGuard(source: string) {
  return /\b(?:can|assertCan|requireAdminPage)\b|\\u/.test(source);
}
