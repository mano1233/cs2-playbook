/**
 * Steam is OpenID 2.0, not OIDC, so there is no off-the-shelf provider. The flow is
 * two steps and the second one is the one that matters:
 *
 *   1. send the browser to Steam with mode=checkid_setup
 *   2. Steam sends it back with a pile of openid.* parameters — POST them all back with
 *      mode=check_authentication and believe nothing until Steam answers is_valid:true
 *
 * Trusting the redirect parameters without step 2 means anyone can hand-craft a URL
 * claiming to be any steamid64. This service is published to the open internet, so that
 * check is the whole of the authentication.
 */
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
export const STEAM_LOGIN = "https://steamcommunity.com/openid/login";

/** Steam's claimed_id is always this shape; the 17 digits are the steamid64. */
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function returnUrl(baseUrl: string): string {
  return `${baseUrl}/api/auth/steam/return`;
}

export function buildAuthUrl(baseUrl: string): string {
  const p = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnUrl(baseUrl),
    "openid.realm": baseUrl,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_LOGIN}?${p.toString()}`;
}

export type VerifyResult =
  | { ok: true; steamid64: string }
  | { ok: false; reason: string };

/**
 * `fetchImpl` is injectable so the tests can exercise the is_valid:false path without
 * talking to Steam.
 */
export async function verifyCallback(
  params: URLSearchParams,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  if (params.get("openid.mode") !== "id_res") {
    return { ok: false, reason: `unexpected openid.mode: ${params.get("openid.mode")}` };
  }

  // Steam echoes return_to back. If it is not ours, this response was minted for a
  // different application and is being replayed at us.
  if (params.get("openid.return_to") !== returnUrl(baseUrl)) {
    return { ok: false, reason: "return_to does not match this service" };
  }

  if (params.get("openid.op_endpoint") !== STEAM_LOGIN) {
    return { ok: false, reason: "op_endpoint is not Steam" };
  }

  const claimed = params.get("openid.claimed_id") ?? "";
  const match = CLAIMED_ID.exec(claimed);
  if (!match?.[1]) return { ok: false, reason: "claimed_id is not a Steam identity" };

  // Hand every openid.* parameter back verbatim — the signature covers them, so
  // dropping or reordering one invalidates the check.
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");

  let text: string;
  try {
    const res = await fetchImpl(STEAM_LOGIN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return { ok: false, reason: `Steam returned HTTP ${res.status}` };
    text = await res.text();
  } catch {
    return { ok: false, reason: "could not reach Steam" };
  }

  // The response is plain key:value lines. Only an exact is_valid:true will do.
  const valid = text
    .split("\n")
    .map((l) => l.trim())
    .includes("is_valid:true");

  if (!valid) return { ok: false, reason: "Steam did not validate this login" };
  return { ok: true, steamid64: match[1] };
}
