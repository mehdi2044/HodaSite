import { vi } from "vitest";

// Data-access integration tests run in Vitest, not inside a Next.js request.
// Keep Next's cache boundary transparent there so the tests exercise the real
// database queries while cache invalidation remains a harmless side effect.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(callback: T): T =>
    callback,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
