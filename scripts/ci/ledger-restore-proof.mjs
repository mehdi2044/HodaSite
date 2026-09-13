// Synthetic CI data only: called by runtime-smoke, never normal application startup.
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const db = new PrismaClient();
const id = "ci-ledger-restore-proof";
const file = "/tmp/hoda-ledger-restore-proof.json";
try {
  if (process.argv[2] === "prepare") {
    const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
    const actor = await db.user.findFirstOrThrow({
      where: { roles: { some: { role: { key: "owner" } } } },
    });
    const accounts = await db.ledgerAccount.findMany({
      where: {
        marketId: market.id,
        currency: "TRY",
        code: { in: ["cash", "partner_capital"] },
      },
      orderBy: { code: "asc" },
    });
    if (accounts.length !== 2) throw Error("missing ledger chart");
    await db.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          id,
          marketId: market.id,
          requestKey: id,
          requestHash: "f".repeat(64),
          memo: "Synthetic restore proof",
          createdById: actor.id,
          effectiveAt: new Date("2003-01-01Z"),
          fxAsOf: new Date("2003-01-01Z"),
          lines: {
            create: accounts.map((a, position) => ({
              accountId: a.id,
              position,
              currency: "TRY",
              debit: position === 0 ? "123.0001" : "0",
              credit: position === 1 ? "123.0001" : "0",
              debitTry: position === 0 ? "123.0001" : "0",
              creditTry: position === 1 ? "123.0001" : "0",
              debitUsd: position === 0 ? "3.0750" : "0",
              creditUsd: position === 1 ? "3.0750" : "0",
              rateTry: "1",
              rateUsd: "0.025",
            })),
          },
        },
      });
      await tx.journalEntry.update({
        where: { id },
        data: { status: "POSTED" },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "ci.ledger.proof",
          entityType: "JournalEntry",
          entityId: id,
        },
      });
    });
  } else if (process.argv[2] !== "verify")
    throw Error("expected prepare or verify");
  const entry = await db.journalEntry.findUniqueOrThrow({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  const audit = await db.auditLog.findMany({
    where: { entityType: "JournalEntry", entityId: id },
    orderBy: { id: "asc" },
  });
  const digest = createHash("sha256")
    .update(JSON.stringify({ entry, audit }))
    .digest("hex");
  if (process.argv[2] === "prepare") await writeFile(file, digest);
  else {
    if (digest !== (await readFile(file, "utf8")))
      throw Error("ledger restore mismatch");
    let blocked = false;
    try {
      await db.journalEntry.update({
        where: { id },
        data: { memo: "illegal mutation" },
      });
    } catch {
      blocked = true;
    }
    if (!blocked) throw Error("ledger immutability missing after restore");
    console.log(
      "Ledger amounts, rates, audit and immutability survived restore",
    );
  }
} finally {
  await db.$disconnect();
}
