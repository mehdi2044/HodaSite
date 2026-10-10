import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { editorInput, initialConfig } from "@/modules/promotions/editor";
import { saveProgramSchema } from "@/modules/promotions/persistence-contracts";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "Example",
    category: "sale",
    description: "",
    ownerNotes: "",
    status: "DRAFT",
    startsAt: "2026-10-03T12:10:15.123",
    priority: "0",
    group: "default",
    stacking: "EXCLUSIVE_GROUP",
    effect: "fixed",
    amount: "99999999999999.9999",
    confirmed: "on",
    "titleI18n.fa": "تخفیف",
    "titleI18n.tr": "İndirim",
    "titleI18n.en": "Discount",
  }))
    f.set(k, v);
  return f;
}
describe("promotion form contract", () => {
  it("defaults to disabled draft and exclusive group", () => {
    const c = initialConfig("2026-10-03T00:00:00Z");
    expect(c).toMatchObject({
      enabled: false,
      status: "DRAFT",
      stacking: "EXCLUSIVE_GROUP",
    });
  });
  it("preserves exact money, UTC milliseconds and empty limits", () => {
    const value = saveProgramSchema.parse(
      editorInput(
        form(),
        "market",
        undefined,
        initialConfig("2026-01-01T00:00:00Z").definition,
        randomUUID(),
      ),
    );
    expect(value.config.definition.effect).toEqual({
      type: "fixed",
      amount: "99999999999999.9999",
    });
    expect(value.config.startsAt).toBe("2026-10-03T12:10:15.123Z");
    expect(value.config.budget).toBeNull();
    expect(value.config.totalUsageCap).toBeNull();
  });
  it("distinguishes zero limits and rejects absent confirmation", () => {
    const f = form();
    f.set("totalUsageCap", "0");
    f.set("budget", "0");
    const build = () =>
      editorInput(
        f,
        "market",
        undefined,
        initialConfig("2026-01-01T00:00:00Z").definition,
        randomUUID(),
      );
    expect(saveProgramSchema.parse(build()).config.totalUsageCap).toBe(0);
    f.delete("confirmed");
    expect(saveProgramSchema.safeParse(build()).success).toBe(false);
  });
  it.each(["1.5", "NaN", "Infinity"])("rejects invalid count %s", (v) => {
    const f = form();
    f.set("priority", v);
    expect(() =>
      editorInput(
        f,
        "market",
        undefined,
        initialConfig("2026-01-01T00:00:00Z").definition,
        randomUUID(),
      ),
    ).toThrow();
  });
  it.each(["percent", "fixed", "freeShipping", "buyXGetY", "spendXGetY"])(
    "converts %s without leaking hidden effect fields",
    (type) => {
      const f = form();
      f.set("effect", type);
      f.set("percent", "10.125");
      f.set("buy", "2");
      f.set("get", "1");
      f.set("spend", "100.0001");
      f.set("amount", "20");
      const v = saveProgramSchema.parse(
        editorInput(
          f,
          "market",
          { id: "program", version: 7 },
          initialConfig("2026-01-01T00:00:00Z").definition,
          randomUUID(),
        ),
      );
      expect(v.config.definition.effect.type).toBe(type);
      expect(v.expectedVersion).toBe(7);
    },
  );
  it("has complete matching translation keys", () => {
    const keys = (v: object, p = ""): string[] =>
      Object.entries(v).flatMap(([k, x]) =>
        typeof x === "object" ? keys(x, p + k + ".") : [p + k],
      );
    expect(keys(fa.promotionAdmin)).toEqual(keys(en.promotionAdmin));
    expect(keys(tr.promotionAdmin)).toEqual(keys(en.promotionAdmin));
  });
});
