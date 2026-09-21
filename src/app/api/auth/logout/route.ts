import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { CSRF_COOKIE, SESSION_COOKIE, logout } from "@/lib/session";
import { sessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await logout(await sessionToken());
  const res = NextResponse.redirect(`${env.publicBaseUrl()}/login`, { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(CSRF_COOKIE);
  return res;
}
