import tseslint from "typescript-eslint";

// Fix-order B1: block `Number(...)`, `parseFloat(...)` and `.toNumber(...)` in
// the money domains. These directories do not exist yet — the rule activates
// as soon as they do. The Money type has no public Decimal accessor, so this
// is a second line of defence, not the primary one.
const MONEY_MODULES = [
  "src/modules/pricing/**/*.ts",
  "src/modules/fees/**/*.ts",
  "src/modules/orders/**/*.ts",
  "src/modules/finance/**/*.ts",
];

const noFloatMoney = [
  "error",
  {
    selector: "CallExpression[callee.name='Number']",
    message: "Money stays Decimal — no Number() in the money domains (B1).",
  },
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: "Money stays Decimal — no parseFloat() in the money domains (B1).",
  },
  {
    selector: "CallExpression[callee.property.name='toNumber']",
    message: "Money stays Decimal — no .toNumber() in the money domains (B1).",
  },
];

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: MONEY_MODULES,
    rules: { "no-restricted-syntax": noFloatMoney },
  },
);
