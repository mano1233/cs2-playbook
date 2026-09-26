import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "y".repeat(48);
  process.env.DATABASE_URL = "postgres://unused/unused";
});

describe("bearerFrom", () => {
  it("reads a bearer token, case-insensitively", async () => {
    const { bearerFrom } = await import("@/lib/api-keys");
    expect(bearerFrom("Bearer pbk_abc")).toBe("pbk_abc");
    expect(bearerFrom("bearer pbk_abc")).toBe("pbk_abc");
    expect(bearerFrom("  Bearer   pbk_abc  ")).toBe("pbk_abc");
  });

  it("ignores anything that is not a bearer header", async () => {
    const { bearerFrom } = await import("@/lib/api-keys");
    expect(bearerFrom(null)).toBeUndefined();
    expect(bearerFrom("")).toBeUndefined();
    expect(bearerFrom("Basic abc")).toBeUndefined();
    expect(bearerFrom("pbk_abc")).toBeUndefined();
    // Two values would be ambiguous; refusing beats picking one.
    expect(bearerFrom("Bearer a b")).toBeUndefined();
  });
});

describe("token shape", () => {
  it("is prefixed so a leak is findable", async () => {
    const { API_KEY_PREFIX } = await import("@/lib/api-keys");
    expect(API_KEY_PREFIX).toBe("pbk_");
  });

  // A token without the prefix is rejected before any database work, which keeps a
  // stray session cookie or random string from costing a query.
  it("refuses a token without the prefix without touching the database", async () => {
    const { playerForApiKey } = await import("@/lib/api-keys");
    await expect(playerForApiKey("not-a-key")).resolves.toBeNull();
    await expect(playerForApiKey(undefined)).resolves.toBeNull();
    await expect(playerForApiKey("")).resolves.toBeNull();
  });
});

describe("safeEqual", () => {
  it("compares without leaking length through early exit", async () => {
    const { safeEqual } = await import("@/lib/api-keys");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
