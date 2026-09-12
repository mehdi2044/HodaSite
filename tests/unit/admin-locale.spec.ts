import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  set: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ auth: state.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: state.set }) }));
vi.mock("next/cache", async (original) => ({
  ...(await original<typeof import("next/cache")>()),
  revalidatePath: state.revalidate,
}));
import { setAdminLocale } from "@/app/admin/(dashboard)/security/actions";
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.mockResolvedValue({ user: { id: "admin" } });
});
it("rejects anonymous and invalid locale before writing a cookie", async () => {
  const form = new FormData();
  form.set("locale", "en");
  state.auth.mockResolvedValue(null);
  await expect(setAdminLocale(form)).rejects.toThrow("UNAUTHENTICATED");
  state.auth.mockResolvedValue({ user: { id: "admin" } });
  form.set("locale", "../../en");
  await expect(setAdminLocale(form)).rejects.toThrow();
  expect(state.set).not.toHaveBeenCalled();
});
it("stores only a supported preference with protected cookie flags", async () => {
  for (const locale of ["fa", "tr", "en"]) {
    const form = new FormData();
    form.set("locale", locale);
    await setAdminLocale(form);
    expect(state.set).toHaveBeenLastCalledWith(
      "hoda.admin.locale",
      locale,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  }
  expect(state.revalidate).toHaveBeenCalledWith("/admin", "layout");
});
