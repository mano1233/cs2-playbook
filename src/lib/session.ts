/**
 * Sessions are opaque random ids, stored hashed. The cookie carries the raw id; the
 * database holds HMAC(id, SESSION_SECRET), so a database leak alone does not hand
 * anyone a working cookie.
 *
 * The authorisation decision lives in `login()`: Steam will happily authenticate every
 * account on earth, so a verified steamid64 is only an identity claim. A session is
 * issued solely when that id is an active row in `players` — the roster is the
 * allowlist, and it is the only thing standing between the team's playbook and the
 * open internet.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { players, sessions } from "@/db/schema";
import { env } from "./env";

export const SESSION_COOKIE = "playbook_session";
export const CSRF_COOKIE = "playbook_csrf";
const TTL_DAYS = 30;

function hmac(value: string, label: string): string {
  return createHmac("sha256", `${env.sessionSecret()}:${label}`).update(value).digest("hex");
}

const hashId = (raw: string) => hmac(raw, "session");

/** Derived, not stored: nothing to keep in sync and nothing extra to leak. */
export const csrfTokenFor = (raw: string) => hmac(raw, "csrf");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type LoginResult =
  | { ok: true; token: string; csrf: string; expiresAt: Date }
  | { ok: false; reason: "not_on_roster" };

export async function login(steamid64: string, userAgent?: string): Promise<LoginResult> {
  const d = db();
  const [player] = await d
    .select()
    .from(players)
    .where(and(eq(players.steamid64, steamid64), eq(players.active, true)))
    .limit(1);

  // A valid Steam login by a stranger is the expected case here, not an error.
  if (!player) return { ok: false, reason: "not_on_roster" };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);

  await d.insert(sessions).values({
    id: hashId(token),
    steamid64,
    expiresAt,
    userAgent: userAgent?.slice(0, 500) ?? null,
  });

  return { ok: true, token, csrf: csrfTokenFor(token), expiresAt };
}

export async function currentPlayer(token: string | undefined) {
  if (!token) return null;
  const d = db();
  const [row] = await d
    .select({ player: players })
    .from(sessions)
    .innerJoin(players, eq(players.steamid64, sessions.steamid64))
    .where(
      and(
        eq(sessions.id, hashId(token)),
        gt(sessions.expiresAt, new Date()),
        eq(players.active, true),
      ),
    )
    .limit(1);
  return row?.player ?? null;
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await db().delete(sessions).where(eq(sessions.id, hashId(token)));
}

/** Expired rows are dead weight; drop them opportunistically. */
export async function pruneExpired() {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
