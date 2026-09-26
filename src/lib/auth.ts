/**
 * Route guards.
 *
 * Two ways in, and the difference matters for CSRF:
 *
 *   - A **session cookie** is ambient. The browser attaches it to any request to this
 *     origin, including one a hostile page caused, which is what CSRF is. So a cookie
 *     request that changes anything must also carry a token only our own page can know.
 *
 *   - A **bearer token** is not ambient. Nothing attaches it automatically; a caller has
 *     to put it in the header deliberately, and a hostile page cannot read it to do so.
 *     There is no cross-site request to forge, so demanding a CSRF token from a script
 *     would be a ritual rather than a defence — and one that makes the API unusable from
 *     a shell.
 *
 * So: CSRF is required for cookies and not for bearer tokens. That is not a loosening;
 * it is the same threat model applied to a credential that behaves differently.
 */
import { cookies, headers } from "next/headers";
import { bearerFrom, playerForApiKey } from "./api-keys";
import { CSRF_COOKIE, SESSION_COOKIE, csrfTokenFor, currentPlayer, safeEqual } from "./session";

type Player = NonNullable<Awaited<ReturnType<typeof currentPlayer>>>;

export type Guard =
  | { ok: true; player: Player; via: "session" | "api_key" }
  | { ok: false; status: number; error: string };

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

async function bearerToken() {
  return bearerFrom((await headers()).get("authorization"));
}

/** Anything that only reads. */
export async function requirePlayer(): Promise<Guard> {
  const bearer = await bearerToken();
  if (bearer) {
    const player = await playerForApiKey(bearer);
    // An invalid key is rejected outright rather than falling through to the cookie:
    // failing over would make a revoked key look like it still worked in a browser.
    if (!player) return { ok: false, status: 401, error: "invalid api key" };
    return { ok: true, player, via: "api_key" };
  }

  const player = await currentPlayer(await sessionToken());
  if (!player) return { ok: false, status: 401, error: "not signed in" };
  return { ok: true, player, via: "session" };
}

/** Anything that changes something. */
export async function requireWriter(): Promise<Guard> {
  const bearer = await bearerToken();
  if (bearer) {
    const player = await playerForApiKey(bearer);
    if (!player) return { ok: false, status: 401, error: "invalid api key" };
    return { ok: true, player, via: "api_key" };
  }

  const token = await sessionToken();
  const player = await currentPlayer(token);
  if (!player || !token) return { ok: false, status: 401, error: "not signed in" };

  const sent = (await headers()).get("x-csrf-token") ?? "";
  if (!sent || !safeEqual(sent, csrfTokenFor(token))) {
    return { ok: false, status: 403, error: "bad csrf token" };
  }
  return { ok: true, player, via: "session" };
}

export { CSRF_COOKIE, SESSION_COOKIE };
