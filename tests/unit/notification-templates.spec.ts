import { describe, expect, it } from "vitest";
import {
  extractVariables,
  notificationTemplateInputSchema,
  renderTemplate,
} from "@/modules/notifications";

const valid = {
  id: "template-1",
  key: "auth.otp",
  isActive: true,
  subjectI18n: { fa: "کد {{code}}", tr: "Kod {{code}}", en: "Code {{code}}" },
  bodyI18n: {
    fa: "اعتبار {{expiresMinutes}} دقیقه",
    tr: "{{expiresMinutes}} dakika",
    en: "Valid for {{expiresMinutes}} minutes",
  },
};

describe("notification templates", () => {
  it("accepts only variables allowed for the selected template", () => {
    expect(notificationTemplateInputSchema.safeParse(valid).success).toBe(true);
    expect(
      notificationTemplateInputSchema.safeParse({
        ...valid,
        bodyI18n: { ...valid.bodyI18n, en: "Hello {{password}}" },
      }).success,
    ).toBe(false);
    expect(
      notificationTemplateInputSchema.safeParse({
        ...valid,
        bodyI18n: { ...valid.bodyI18n, en: "Hello {{code" },
      }).success,
    ).toBe(false);
    expect(
      notificationTemplateInputSchema.safeParse({
        ...valid,
        bodyI18n: { ...valid.bodyI18n, en: "Hello code}}" },
      }).success,
    ).toBe(false);
  });
  it("extracts and renders known variables without evaluating content", () => {
    expect(extractVariables("A {{code}} B {{code}}")).toEqual(["code", "code"]);
    expect(renderTemplate("Code {{code}}", ["code"], { code: "123456" })).toBe(
      "Code 123456",
    );
  });
});
