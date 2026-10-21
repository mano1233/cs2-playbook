import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requirePlayer: vi.fn(), requireWriter: vi.fn() }));
vi.mock("@/lib/throws", () => ({
  getLineup: vi.fn(), getThrow: vi.fn(), deleteLineup: vi.fn(), lineupPatchFrom: vi.fn(), updateLineup: vi.fn(),
}));
import { requirePlayer } from "@/lib/auth";
import { getLineup, getThrow } from "@/lib/throws";
import { GET } from "@/app/api/lineups/[id]/route";

const id = "4eb23f21-a072-4e5e-a825-000000000001";
const request = (value = id) => GET(new Request("http://localhost"), { params: Promise.resolve({ id: value }) });
beforeEach(() => vi.resetAllMocks());

it("rejects an unauthenticated request before reading lineup data", async () => {
  vi.mocked(requirePlayer).mockResolvedValue({ ok: false, status: 401, error: "not signed in" });
  expect((await request()).status).toBe(401);
  expect(getLineup).not.toHaveBeenCalled();
});
it("validates IDs before querying", async () => {
  vi.mocked(requirePlayer).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof requirePlayer>>);
  expect((await request("invalid")).status).toBe(400);
  expect(getLineup).not.toHaveBeenCalled();
});
it("returns 404 for a missing lineup", async () => {
  vi.mocked(requirePlayer).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof requirePlayer>>);
  vi.mocked(getLineup).mockResolvedValue(null);
  expect((await request()).status).toBe(404);
});
it("provides capture metadata without permitting browser caching", async () => {
  vi.mocked(requirePlayer).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof requirePlayer>>);
  vi.mocked(getLineup).mockResolvedValue({ id, throwId: id, throwX: 0, pitch: -20 } as NonNullable<Awaited<ReturnType<typeof getLineup>>>);
  vi.mocked(getThrow).mockResolvedValue({ id, map: "de_mirage", name: "Test smoke" } as NonNullable<Awaited<ReturnType<typeof getThrow>>>);
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ map: "de_mirage", throwName: "Test smoke", lineup: { id, throwX: 0 } });
});
