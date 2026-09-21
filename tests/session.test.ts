import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(48);
  process.env.DATABASE_URL = "postgres://unused/unused";
});

describe("csrf tokens", () => {
  it("are derived from the session token, not stored", async () => {
    const { csrfTokenFor } = await import("@/lib/session");
    expect(csrfTokenFor("token-a")).toBe(csrfTokenFor("token-a"));
    expect(csrfTokenFor("token-a")).not.toBe(csrfTokenFor("token-b"));
  });

  it("are not simply the session token", async () => {
    const { csrfTokenFor } = await import("@/lib/session");
    expect(csrfTokenFor("token-a")).not.toContain("token-a");
  });
});

describe("safeEqual", () => {
  it("compares equal strings", async () => {
    const { safeEqual } = await import("@/lib/session");
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings, including different lengths", async () => {
    const { safeEqual } = await import("@/lib/session");
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "abc")).toBe(false);
  });
});

describe("env", () => {
  it("refuses a short SESSION_SECRET", async () => {
    const { env } = await import("@/lib/env");
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "too-short";
    expect(() => env.sessionSecret()).toThrow(/at least 32/);
    process.env.SESSION_SECRET = prev;
  });

  it("trims trailing slashes from the public base url", async () => {
    const { env } = await import("@/lib/env");
    process.env.PUBLIC_BASE_URL = "https://playbook.example.ts.net//";
    expect(env.publicBaseUrl()).toBe("https://playbook.example.ts.net");
  });
});
