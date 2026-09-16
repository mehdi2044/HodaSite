import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHomepage } from "@/modules/content/homepage";

type Row = {
  id: string;
  marketId: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
  blocks: Array<{
    type: "RichText";
    text: { fa: string; tr: string; en: string };
  }>;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  cache: new Map<string, unknown>(),
  contentReads: 0,
  fail: false,
}));

// Unlike the transparent global test stub, retain results across requests.
// Mutations below deliberately do not call revalidateTag (CLI/seed behavior).
vi.mock("next/cache", () => ({
  unstable_cache:
    (read: () => Promise<unknown>, keys: string[]) => async () => {
      const key = JSON.stringify(keys);
      if (!state.cache.has(key)) state.cache.set(key, await read());
      return structuredClone(state.cache.get(key));
    },
}));
vi.mock("@/lib/db", () => ({
  db: {
    homepage: {
      findMany: vi.fn(
        async (args: {
          where: { OR: Array<{ marketId: string | null }> };
          select?: unknown;
        }) => {
          if (state.fail) throw new Error("database unavailable");
          const rows = state.rows.filter(
            (row) =>
              !row.deletedAt &&
              args.where.OR.some((scope) => scope.marketId === row.marketId),
          );
          if (args.select)
            return rows.map(({ id, marketId, updatedAt }) => ({
              id,
              marketId,
              updatedAt,
            }));
          state.contentReads++;
          return structuredClone(rows);
        },
      ),
    },
  },
}));

function row(
  id: string,
  marketId: string | null,
  text: string,
  revision = 1,
): Row {
  return {
    id,
    marketId,
    updatedAt: new Date(revision),
    deletedAt: null,
    blocks: [{ type: "RichText", text: { fa: text, tr: text, en: text } }],
  };
}

beforeEach(() => {
  state.rows = [row("global", null, "old")];
  state.cache.clear();
  state.contentReads = 0;
  state.fail = false;
});

describe("homepage revision cache", () => {
  it("refreshes every warmed market after a global CLI upgrade without a restart", async () => {
    for (const market of ["IR", "TR", "CA"]) await getHomepage(market);
    state.rows[0] = row("global", null, "upgraded", 2);
    for (const market of ["IR", "TR", "CA"])
      expect((await getHomepage(market)).blocks).toEqual(state.rows[0].blocks);
  });

  it("keeps persistent content caching while revisions are unchanged", async () => {
    await getHomepage("IR");
    await getHomepage("IR");
    expect(state.contentReads).toBe(1);
    state.rows[0] = row("global", null, "edited", 2);
    expect((await getHomepage("IR")).blocks).toEqual(state.rows[0].blocks);
    expect(state.contentReads).toBe(2);
  });

  it("invalidates cached empty content when seed creates the homepage", async () => {
    state.rows = [];
    expect((await getHomepage("IR")).blocks).toEqual([]);
    state.rows.push(row("global", null, "created"));
    expect((await getHomepage("IR")).blocks).toEqual(state.rows[0].blocks);
  });

  it("handles override creation, edits, soft deletion and replacement without leaking markets", async () => {
    await getHomepage("IR");
    await getHomepage("TR");
    state.rows.push(row("override", "IR", "IR only"));
    expect((await getHomepage("IR")).id).toBe("override");
    expect((await getHomepage("TR")).id).toBe("global");
    state.rows[1] = row("override", "IR", "edited", 2);
    expect((await getHomepage("IR")).blocks).toEqual(state.rows[1].blocks);
    state.rows[1].deletedAt = new Date(3);
    expect((await getHomepage("IR")).id).toBe("global");
    state.rows[1] = row("replacement", "IR", "replacement", 2);
    expect((await getHomepage("IR")).id).toBe("replacement");
    state.rows.pop();
    expect((await getHomepage("IR")).id).toBe("global");
  });

  it("does not silently serve an old composition when revision lookup fails", async () => {
    await getHomepage("IR");
    state.fail = true;
    await expect(getHomepage("IR")).rejects.toThrow("database unavailable");
  });
});
