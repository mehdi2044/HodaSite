import { expect, it, vi } from "vitest";
const locale = vi.hoisted(() => ({ translate: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: locale.translate }));
import { runAction } from "@/lib/action-result";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
import fa from "../../messages/fa.json";
it("uses runtime admin translations for action errors", async () => {
  locale.translate.mockResolvedValue((key: string) => `localized:${key}`);
  expect(
    await runAction(async () => {
      throw new ForbiddenError("users.manage");
    }),
  ).toMatchObject({
    ok: false,
    code: "FORBIDDEN",
    message: "localized:forbidden",
  });
});
it("keeps direct action calls outside Next request storage usable", async () => {
  locale.translate.mockRejectedValue(new Error("No request context"));
  expect(
    await runAction(async () => {
      throw new UnauthorizedError();
    }),
  ).toMatchObject({ message: fa.errors.unauthenticated });
});
