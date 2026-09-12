import { describe, expect, it } from "vitest";
import {
  evaluateAccess,
  PERMISSIONS,
  type AccessSubject,
  type Scope,
} from "@/modules/access";
import contract from "../fixtures/phase05-permission-contract.json";
const subjects: Record<string, AccessSubject | null> = Object.fromEntries(
  Object.entries(contract.roles).map(([role, permissions]) => [
    role,
    {
      isActive: true,
      overrides: [],
      roles: [
        {
          scope: { marketId: "TR", categoryId: "clothing", section: "catalog" },
          role: {
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    },
  ]),
);
subjects.override = {
  isActive: true,
  roles: [],
  overrides: [
    {
      permission: "order.view",
      allow: true,
      scope: { marketId: "TR", categoryId: "clothing", section: "catalog" },
    },
    { permission: "payment.refund", allow: false, scope: null },
  ],
};
subjects.anonymous = null;
const targets: [string, Scope][] = [
  ["in", { marketId: "TR", categoryId: "clothing", section: "catalog" }],
  [
    "market-out",
    { marketId: "IR", categoryId: "clothing", section: "catalog" },
  ],
  ["category-out", { marketId: "TR", categoryId: "other", section: "catalog" }],
  ["section-out", { marketId: "TR", categoryId: "clothing", section: "other" }],
  ["unspecified", {}],
];
describe("declared permission contract and all subject × permission × scope decisions", () => {
  it("requires an explicit contract update for every namespace change", () =>
    expect([...PERMISSIONS]).toEqual(contract.permissions));
  for (const [subject, user] of Object.entries(subjects))
    for (const permission of contract.permissions)
      for (const [scope, target] of targets) {
        it(`${subject} / ${permission} / ${scope}`, () => {
          const grants =
            subject === "override"
              ? ["order.view"]
              : subject === "anonymous"
                ? []
                : contract.roles[subject as keyof typeof contract.roles];
          expect(evaluateAccess(user, permission, target)).toBe(
            scope === "in" &&
              (grants.includes("*") || grants.includes(permission)),
          );
        });
      }
  it("matching user deny overrides an owner wildcard and inactive users never pass", () => {
    const owner = subjects.owner!;
    expect(
      evaluateAccess(
        {
          ...owner,
          overrides: [{ permission: "order.view", allow: false, scope: null }],
        },
        "order.view",
        targets[0][1],
      ),
    ).toBe(false);
    expect(
      evaluateAccess(
        { ...owner, isActive: false },
        "order.view",
        targets[0][1],
      ),
    ).toBe(false);
  });
});
