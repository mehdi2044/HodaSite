import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { seal } from "@/lib/secure-tokens";
import contract from "../fixtures/phase05-permission-contract.json";
export const MATRIX_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const MATRIX_PASSWORD = "MatrixTest123!";
export const SUBJECTS = [
  ...Object.keys(contract.roles),
  "override",
  "anonymous",
];
export const GLOBAL_SCOPES = [
  "in",
  "market-out",
  "category-out",
  "section-out",
] as const;
export type MatrixSubject = { id: string | null; name: string; scope: string };
export function granted(name: string, permission: string) {
  if (name === "anonymous") return false;
  if (name === "override" && permission === "settings.brand.edit") return true;
  if (name === "override" && permission === "order.view") return false;
  const grants =
    contract.roles[
      (name === "override" ? "warehouse" : name) as keyof typeof contract.roles
    ];
  return grants.includes("*") || grants.includes(permission);
}
export async function matrixSubjects(global = true) {
  const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  const category = await db.category.findFirstOrThrow();
  const hash = await bcrypt.hash(MATRIX_PASSWORD, 4);
  const subjects: MatrixSubject[] = [];
  for (const name of SUBJECTS)
    for (const scopeName of global ? GLOBAL_SCOPES : (["in"] as const)) {
      if (name === "anonymous") {
        subjects.push({ id: null, name, scope: scopeName });
        continue;
      }
      const scope =
        !global || scopeName === "market-out"
          ? { marketId: tr.id }
          : scopeName === "category-out"
            ? { categoryId: category.id }
            : scopeName === "section-out"
              ? { section: "catalog" }
              : {};
      const role = await db.role.findUniqueOrThrow({
        where: { key: name === "override" ? "warehouse" : name },
      });
      const user = await db.user.create({
        data: {
          email: `v4-${randomUUID()}@example.com`,
          name: `Matrix ${name}`,
          passwordHash: hash,
          mfaEnabled: true,
          mfaSecret: seal(MATRIX_SECRET),
          roles: { create: { roleId: role.id, scope } },
          ...(name === "override"
            ? {
                overrides: {
                  create: [
                    { permission: "settings.brand.edit", allow: true, scope },
                    { permission: "order.view", allow: false, scope: {} },
                  ],
                },
              }
            : {}),
        },
      });
      subjects.push({ id: user.id, name, scope: scopeName });
    }
  return subjects;
}
export function form(
  values: Record<string, string | string[]>,
  forged = false,
) {
  const f = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value])
      f.append(key, item);
  if (forged)
    for (const [key, value] of Object.entries({
      userId: "seed-owner",
      actorId: "seed-owner",
      permission: "*",
      role: "owner",
      scope: "{}",
      allowed: "true",
    }))
      f.set(key, value);
  return f;
}

/** Real PostgreSQL row digests: catches denied inserts, updates and deletes,
 * including unaudited changes. Only explicit Prisma model names are allowed. */
export async function fingerprint(tables: string[]) {
  const models = new Set(
    Prisma.dmmf.datamodel.models.map((model) => model.name),
  );
  for (const table of tables)
    if (!models.has(table)) throw new Error("UNKNOWN_MATRIX_TABLE");
  return db.$queryRaw<{ name: string; digest: string }[]>(
    Prisma.join(
      tables.map(
        (table) => Prisma.sql`
 SELECT ${table}::text AS name, md5(coalesce(string_agg(to_jsonb(t)::text, ',' ORDER BY t.id::text), '')) AS digest
 FROM ${Prisma.raw('"' + table + '"')} t
 `,
      ),
      " UNION ALL ",
    ),
  );
}

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error)
    return String(error.code);
  if (error instanceof Error && error.message === "UNAUTHENTICATED")
    return "UNAUTHORIZED";
  return error instanceof Error ? error.message : String(error);
}
