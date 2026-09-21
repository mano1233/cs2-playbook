import { describe, expect, it, vi } from "vitest";
import { STEAM_LOGIN, buildAuthUrl, returnUrl, verifyCallback } from "@/lib/steam";

const BASE = "https://playbook.example.ts.net";
const STEAMID = "76561198059143085";

/** A callback that is well-formed in every respect except what a test overrides. */
function callback(over: Record<string, string> = {}) {
  return new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_LOGIN,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAMID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAMID}`,
    "openid.return_to": returnUrl(BASE),
    "openid.response_nonce": "2026-09-21T10:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "Zm9vYmFy",
    ...over,
  });
}

const steamSays = (body: string) =>
  vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

describe("buildAuthUrl", () => {
  it("asks Steam to pick the identity and points back at our return route", () => {
    const u = new URL(buildAuthUrl(BASE));
    expect(u.origin + u.pathname).toBe(STEAM_LOGIN);
    expect(u.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(u.searchParams.get("openid.return_to")).toBe(`${BASE}/api/auth/steam/return`);
    expect(u.searchParams.get("openid.realm")).toBe(BASE);
    expect(u.searchParams.get("openid.identity")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
  });
});

describe("verifyCallback", () => {
  it("accepts a login Steam confirms", async () => {
    const res = await verifyCallback(callback(), BASE, steamSays("ns:...\nis_valid:true\n"));
    expect(res).toEqual({ ok: true, steamid64: STEAMID });
  });

  // The whole point of step two. Without it, anyone can forge a claimed_id.
  it("rejects a login Steam does not confirm", async () => {
    const res = await verifyCallback(callback(), BASE, steamSays("ns:...\nis_valid:false\n"));
    expect(res.ok).toBe(false);
  });

  it("rejects is_valid:true appearing as a substring of another value", async () => {
    const res = await verifyCallback(
      callback(),
      BASE,
      steamSays("ns:...\nis_valid:falseis_valid:true_not_really\n"),
    );
    expect(res.ok).toBe(false);
  });

  it("forwards every openid parameter verbatim, with mode swapped", async () => {
    const spy = steamSays("is_valid:true");
    await verifyCallback(callback(), BASE, spy);

    const [url, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(STEAM_LOGIN);
    const sent = new URLSearchParams(String((init as RequestInit).body));
    expect(sent.get("openid.mode")).toBe("check_authentication");
    expect(sent.get("openid.sig")).toBe("Zm9vYmFy");
    expect(sent.get("openid.signed")).toBe(callback().get("openid.signed"));
    expect(sent.get("openid.response_nonce")).toBe("2026-09-21T10:00:00Zabc");
  });

  // A response minted for another site, replayed here.
  it("rejects a return_to belonging to someone else", async () => {
    const res = await verifyCallback(
      callback({ "openid.return_to": "https://evil.example/api/auth/steam/return" }),
      BASE,
      steamSays("is_valid:true"),
    );
    expect(res.ok).toBe(false);
  });

  it("rejects an op_endpoint that is not Steam", async () => {
    const res = await verifyCallback(
      callback({ "openid.op_endpoint": "https://evil.example/openid/login" }),
      BASE,
      steamSays("is_valid:true"),
    );
    expect(res.ok).toBe(false);
  });

  it.each([
    ["http, not https", "http://steamcommunity.com/openid/id/76561198059143085"],
    ["a lookalike host", "https://steamcommunity.com.evil.example/openid/id/76561198059143085"],
    ["too few digits", "https://steamcommunity.com/openid/id/7656119805914308"],
    ["not a number", "https://steamcommunity.com/openid/id/abcdefghijklmnopq"],
  ])("rejects a claimed_id with %s", async (_why, claimed) => {
    const res = await verifyCallback(
      callback({ "openid.claimed_id": claimed }),
      BASE,
      steamSays("is_valid:true"),
    );
    expect(res.ok).toBe(false);
  });

  it("rejects a cancelled login", async () => {
    const res = await verifyCallback(
      callback({ "openid.mode": "cancel" }),
      BASE,
      steamSays("is_valid:true"),
    );
    expect(res.ok).toBe(false);
  });

  it("fails closed when Steam is unreachable", async () => {
    const boom = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const res = await verifyCallback(callback(), BASE, boom);
    expect(res.ok).toBe(false);
  });

  it("fails closed when Steam returns an error status", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const res = await verifyCallback(callback(), BASE, bad);
    expect(res.ok).toBe(false);
  });
});
