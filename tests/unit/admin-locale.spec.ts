import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["http://127.0.0.1:3000", false],
  ["http://localhost:3000", false],
  ["http://[::1]:3000", false],
  ["https://shop.example.com", true],
  ["http://shop.example.com", true],
  ["", true],
  ["invalid", true],
  ["http://localhost.example.com", true],
])(
  "production display cookie at %s retains the correct Secure flag",
  async (origin, secure) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", origin);
    const form = new FormData();
    form.set("locale", "tr");
    await setAdminLocale(form);
    expect(state.set).toHaveBeenCalledWith(
      "hoda.admin.locale",
      "tr",
      expect.objectContaining({
        secure,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  },
);
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
