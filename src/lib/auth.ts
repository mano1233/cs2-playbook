/**
 * Route-level guards. Every mutating route calls `requireWriter`; anything that only
 * reads calls `requirePlayer`. SameSite=Lax already blocks the ordinary cross-site form
 * post, so the CSRF check is defence in depth rather than the only line.
 */
import { cookies, headers } from "next/headers";
import { CSRF_COOKIE, SESSION_COOKIE, csrfTokenFor, currentPlayer, safeEqual } from "./session";

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function requirePlayer() {
  const player = await currentPlayer(await sessionToken());
  if (!player) return { ok: false as const, status: 401, error: "not signed in" };
  return { ok: true as const, player };
}

export async function requireWriter() {
  const token = await sessionToken();
  const player = await currentPlayer(token);
  if (!player || !token) return { ok: false as const, status: 401, error: "not signed in" };

  const sent = (await headers()).get("x-csrf-token") ?? "";
  if (!sent || !safeEqual(sent, csrfTokenFor(token))) {
    return { ok: false as const, status: 403, error: "bad csrf token" };
  }
  return { ok: true as const, player };
}

export { CSRF_COOKIE, SESSION_COOKIE };
