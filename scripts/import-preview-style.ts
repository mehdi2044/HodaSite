import { db } from "../src/lib/db";
import { storage } from "../src/modules/integrations/storage";
import {
  applyPreviewStyleCatalog,
  planPreviewStyleCatalog,
  requireLocalPreview,
  PreviewImportError,
} from "./lib/preview-style-catalog";

async function main() {
  requireLocalPreview(process.env);
  const actor = await db.user.findUnique({
    where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
  });
  if (!actor)
    throw new PreviewImportError(
      "Configured owner account was not found; no account or password was changed.",
    );
  const plan = await planPreviewStyleCatalog(db, actor.id);
  console.log(
    JSON.stringify({
      mode: "plan",
      missingProducts: plan.missing,
      retainedProducts: plan.retained,
      homepageEligible: plan.upgradeHomepage,
      digest: plan.digest,
    }),
  );
  if (!process.argv.includes("--apply")) return;
  if (!process.argv.includes("--confirm-demo-data"))
    throw new PreviewImportError(
      "Apply requires --confirm-demo-data and a verified backup of this preview.",
    );
  console.log(
    JSON.stringify(await applyPreviewStyleCatalog(db, storage, actor.id, plan)),
  );
}
main()
  .catch((error) => {
    // Expected messages contain no DB URL, credential or raw provider response.
    console.error(
      error instanceof PreviewImportError
        ? error.message
        : "Preview import failed; no general seed was run. Check the isolated diagnostics.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
