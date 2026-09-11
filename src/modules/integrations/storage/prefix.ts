import { readFile } from "node:fs/promises";
/** A runtime pointer shared with ops; an invalid pointer must never fall back to old data. */
export function parseStoragePrefix(value: string) {
  const prefix = value.trim();
  if (prefix !== "" && !/^_hoda_restore\/[a-f0-9-]{36}\/$/.test(prefix))
    throw new Error("Invalid S3 generation pointer");
  return prefix;
}
export async function activeStoragePrefix() {
  try {
    return parseStoragePrefix(
      await readFile(process.env.S3_PREFIX_FILE ?? "/data/s3-prefix", "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
