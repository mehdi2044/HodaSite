// Synthetic runtime CI fixture only; never called by application startup.
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
const db = new PrismaClient();
const id = "ci-content-restore-proof";
const revisionId = `${id}-revision`;
const file = "/tmp/hoda-content-restore-proof.json";
try {
  if (process.argv[2] === "prepare") {
    const source = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
    const actor = await db.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "owner" } } } } });
    const blocks = [{ type: "RichText", text: { fa: "پیش‌نویس آزمون بازگردانی", tr: "Geri yükleme taslağı", en: "Restore draft proof" } }];
    await db.$transaction(async tx => {
      await tx.market.create({ data: { id, code: "CI-CONTENT-RESTORE", name: "Synthetic content restore fixture", currency: source.currency,
        defaultLocale: "en", enabledLocales: ["fa", "tr", "en"], roundingRule: source.roundingRule, holdHours: 1, paymentDeadlineHours: 1, fxMode: source.fxMode } });
      await tx.homepage.create({ data: { id, marketId: id, isPublished: false, version: 7,
        blocks: [], draftBlocks: blocks, draftRevisionId: revisionId, publishedRevisionId: null,
        scheduledRevisionId: revisionId, scheduledVersion: 7, scheduledById: actor.id,
        scheduledAt: new Date("2099-01-01T00:00:00Z"), scheduleError: "INVALID_REFERENCES" } });
      await tx.auditLog.create({ data: { id: revisionId, userId: actor.id, action: "content.homepage.revision", entityType: "Homepage", entityId: id,
        after: { format: "homepage-revision-v1", version: 7, blocks } } });
    });
  } else if (process.argv[2] !== "verify") throw Error("expected prepare or verify");
  const homepage = await db.homepage.findUniqueOrThrow({ where: { id } });
  const revision = await db.auditLog.findUniqueOrThrow({ where: { id: revisionId } });
  const digest = createHash("sha256").update(JSON.stringify({ homepage, revision })).digest("hex");
  if (process.argv[2] === "prepare") await writeFile(file, digest);
  else {
    assert.equal(digest, await readFile(file, "utf8"), "Content revision/publication restore mismatch");
    await assert.rejects(db.auditLog.update({ where: { id: revisionId }, data: { action: "illegal mutation" } }), /append-only/);
    console.log("Homepage draft/version/schedule and immutable revision survived restore");
  }
} finally { await db.$disconnect(); }
