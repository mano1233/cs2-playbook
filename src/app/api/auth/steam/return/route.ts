import { NextResponse } from "next/server";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { env } from "@/lib/env";
import { login } from "@/lib/session";
import { verifyCallback } from "@/lib/steam";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = env.publicBaseUrl();
  const url = new URL(request.url);

  const verified = await verifyCallback(url.searchParams, base);
  if (!verified.ok) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(verified.reason)}`);
  }

  const result = await login(
    verified.steamid64,
    request.headers.get("user-agent") ?? undefined,
  );

  // Authenticated by Steam, but not one of us. Say so plainly rather than pretending
  // the login failed — it did not, the roster simply does not contain them.
  if (!result.ok) {
    return NextResponse.redirect(`${base}/login?error=not_on_roster`);
  }

  const res = NextResponse.redirect(base);
  const secure = base.startsWith("https://");

  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  // Readable by the browser on purpose: the client echoes it back in x-csrf-token.
  res.cookies.set(CSRF_COOKIE, result.csrf, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });

  return res;
}
