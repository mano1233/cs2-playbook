/**
 * API keys, so a script can do what a signed-in teammate can.
 *
 * The endpoints already existed; what was missing was an auth method that is not a
 * browser session. A cookie plus a CSRF header cannot be produced by a shell script
 * without pretending to be a browser, so bulk work — importing a folder of lineups,
 * seeding a map — had no way in.
 *
 * Stored hashed with the same HMAC trick as sessions: reading this table hands nobody
 * a working key. The plaintext exists once, at creation, and is never recoverable.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, players } from "@/db/schema";
import { env } from "./env";

/**
 * Prefixed on purpose. A key that leaks into a log, a paste or a commit is findable by
 * searching for the prefix, and secret scanners key off exactly this shape.
 */
const PREFIX = "pbk_";

const hash = (token: string) =>
  createHmac("sha256", `${env.sessionSecret()}:apikey`).update(token).digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface CreatedKey {
  id: string;
  name: string;
  /** Shown once. There is no second chance to read it, by design. */
  token: string;
}

export async function createApiKey(steamid64: string, name: string): Promise<CreatedKey> {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db()
    .insert(apiKeys)
    .values({ tokenHash: hash(token), steamid64, name: name.trim().slice(0, 60) || "unnamed" })
    .returning();
  return { id: row!.id, name: row!.name, token };
}

/**
 * Resolves a bearer token to the player who owns it, or null.
 *
 * Checks the same things a session does: the key must exist, not be revoked, and belong
 * to somebody still on the roster — so removing a teammate kills their keys too rather
 * than leaving a credential behind them.
 */
export async function playerForApiKey(token: string | undefined) {
  if (!token || !token.startsWith(PREFIX)) return null;

  const d = db();
  const [row] = await d
    .select({ key: apiKeys, player: players })
    .from(apiKeys)
    .innerJoin(players, eq(players.steamid64, apiKeys.steamid64))
    .where(
      and(
        eq(apiKeys.tokenHash, hash(token)),
        isNull(apiKeys.revokedAt),
        eq(players.active, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Best-effort: a failed touch must not fail the request it was recording.
  void d
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.key.id))
    .catch(() => {});

  return row.player;
}

export function listApiKeys(steamid64: string) {
  return db()
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.steamid64, steamid64))
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * Revoked rather than deleted: the row is the only record that the key existed and was
 * used, which is what you want when working out what a leaked one touched.
 */
export async function revokeApiKey(id: string, steamid64: string) {
  const [row] = await db()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.steamid64, steamid64)))
    .returning();
  return row ?? null;
}

export function bearerFrom(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1];
}

export { PREFIX as API_KEY_PREFIX };
