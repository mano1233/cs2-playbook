# cs2-playbook

The team's strategies, per map and per side: execs, CT setups, retakes and after-plant,
with the utility lineups that go with them.

Runs in the [midgard](https://github.com/mano1233/midgard) cluster next to
[cs2-analyzer](https://github.com/mano1233/cs2-analyzer), published to the internet
through Tailscale Funnel. The two are separate services and neither imports the other.

## What it is for

`cs2-analyzer` measures what happened in a match. Nothing recorded what the team meant
to do. This holds the intent: a strat is a short timeline of per-player assignments over
a radar, and each piece of utility carries the lineup needed to throw it.

Most team playbooks die because adding the second strat is too much work, so the
authoring side is built for speed of capture rather than fidelity: pins on a radar, a
palette that stays armed, and phases that copy player positions forward.

## Layout

| Path | Role |
|---|---|
| `src/db/schema.ts` | The model. Coordinates are Source world units and maps are `de_nuke`, matching cs2-analyzer so the two can be joined later |
| `src/lib/steam.ts` | Steam OpenID 2.0. Two steps, and the second one is the authentication |
| `src/lib/session.ts` | Sessions, stored hashed, plus the roster allowlist check |
| `src/lib/auth.ts` | Route guards: `requirePlayer` to read, `requireWriter` to change |
| `src/app/` | Routes and pages |
| `scripts/migrate.mjs` | Runs before the server starts. Plain JS: there is no TypeScript in the image |
| `scripts/seed-roster.mjs` | Writes the allowlist |

## Coordinates

Positions are stored in **raw Source world units**, the same frame as cs2-analyzer's
`plant_x/plant_y/plant_z`, never in radar pixels. Pixels are a rendering detail computed
at display time from `pos_x`, `pos_y` and `scale` in `resource/overviews/<map>.txt`:

```
px = (world_x - pos_x) / scale
py = (pos_y - world_y) / scale
```

Nuke and Vertigo have a `verticalsections` radar, so the lower site is a separate image
with its own calibration — hence `level` on every placed object.

Radar images are Valve assets and live in R2, not in this repo and not in the image.

## Running locally

```bash
docker compose up -d          # postgres on 5433
cp .env.example .env.local    # then fill in SESSION_SECRET
npm ci
npm run migrate
ROSTER="76561198...:mirithefish" npm exec -- node scripts/seed-roster.mjs
npm run dev
```

Steam sign-in works against `http://localhost:3000`: the browser performs the redirect
and verification is a server-to-Steam POST, so no public hostname is needed to develop.

## Tests

```bash
npm test
npm run typecheck
```

They cover the Steam verification — including a forged `claimed_id`, a replayed
`return_to`, an `is_valid:false` answer and Steam being unreachable — the CSRF
derivation, and the environment guards. CI runs them on every push and pull request, and
the image build depends on them.

## Authentication

Funnel publishes this service to the whole internet with nothing in front of it, so
every control is the application's own.

Steam is OpenID 2.0, not OIDC. The browser is sent to Steam with `checkid_setup`; when
it comes back, every `openid.*` parameter is POSTed to Steam with
`mode=check_authentication` and nothing is believed until Steam answers `is_valid:true`.
Skipping that step would let anyone hand-craft a URL claiming any steamid64.

Steam will authenticate every account on earth, so a verified steamid64 is only an
identity claim. A session is issued **only** when that id is an active row in `players`.
The roster is the allowlist.

Sessions are 256-bit random ids in an `HttpOnly; Secure; SameSite=Lax` cookie, stored
HMAC-hashed so a database leak does not yield working cookies. The CSRF token is derived
from the session token rather than stored — nothing to keep in sync.

## Environment

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres. CloudNativePG in the cluster, `docker compose` locally |
| `SESSION_SECRET` | At least 32 characters. HMACs session ids and derives CSRF tokens |
| `PUBLIC_BASE_URL` | Where the browser actually reaches this. Steam echoes it back and it is compared, so a wrong value fails the login rather than redirecting somewhere unexpected |
| `STEAM_API_KEY` | Optional. Avatars and display names only |
| `R2_BUCKET`, `R2_ENDPOINT` | Lineup screenshots and radar images |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | R2 credentials, minted by Terraform |
| `ROSTER` | Seeding only: `steamid64:nickname,...` |

## Versioning

The tag in `VERSION` is what the build publishes and what midgard's Terraform pins.
Bump it in the same commit as the change it ships.
