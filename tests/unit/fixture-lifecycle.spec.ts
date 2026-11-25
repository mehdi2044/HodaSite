import { describe, expect, it } from "vitest";
import { FixtureLifecycle } from "../helpers/fixture-lifecycle";

describe("financial fixture lifecycle", () => {
  it("drains the actual body before reading a version for cleanup and admitting the next case", async () => {
    const lifecycle = new FixtureLifecycle(),
      events: string[] = [];
    let release!: () => void,
      version = 1;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const body = lifecycle.track(async () => {
      await gate;
      version++;
      events.push("body.commit");
    })();
    const cleanup = lifecycle.finish(async () => {
      events.push(`cleanup.version.${version}`);
      version++;
      events.push("cleanup.commit");
    });
    const next = lifecycle.ready().then(() => events.push("next"));
    await Promise.resolve();
    expect(events).toEqual([]);
    release();
    await Promise.all([body, cleanup, next]);
    expect(events).toEqual([
      "body.commit",
      "cleanup.version.2",
      "cleanup.commit",
      "next",
    ]);
    expect(version).toBe(3);
  });
  it("preserves a body's rejection while allowing its completed fixture to be cleaned", async () => {
    const lifecycle = new FixtureLifecycle();
    const body = lifecycle.track(async () => {
      throw new Error("EXPECTED_BODY_FAILURE");
    })();
    await expect(body).rejects.toThrow("EXPECTED_BODY_FAILURE");
    let cleaned = false;
    await lifecycle.finish(async () => {
      cleaned = true;
    });
    expect(cleaned).toBe(true);
    await lifecycle.ready();
  });
  it("does not admit another case after failed cleanup", async () => {
    const lifecycle = new FixtureLifecycle();
    await expect(
      lifecycle.finish(async () => {
        throw new Error("CLEANUP_FAILED");
      }),
    ).rejects.toThrow("CLEANUP_FAILED");
    await expect(lifecycle.ready()).rejects.toThrow("CLEANUP_FAILED");
  });
});
