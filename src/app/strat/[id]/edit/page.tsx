import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { TopBar } from "@/components/TopBar";
import { StratEditor, type EditorState } from "@/components/StratEditor";
import { db } from "@/db";
import { players } from "@/db/schema";
import { requirePlayer, sessionToken } from "@/lib/auth";
import { mapDisplayName, radarFor } from "@/lib/radar";
import { csrfTokenFor } from "@/lib/session";
import { getStrat } from "@/lib/strats";
import { listThrows } from "@/lib/throws";

export const dynamic = "force-dynamic";

export default async function EditStrat({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { id } = await params;
  const full = await getStrat(id);
  if (!full || !radarFor(full.strat.map)) notFound();

  const roster = await db()
    .select({ steamid64: players.steamid64, nickname: players.nickname })
    .from(players)
    .where(eq(players.active, true));

  const initial: EditorState = {
    version: full.strat.version,
    name: full.strat.name,
    kind: full.strat.kind,
    target: full.strat.target,
    status: full.strat.status,
    description: full.strat.description,
    phases: full.phases.map((p) => ({
      id: p.phase.id,
      name: p.phase.name,
      clockOffsetS: p.phase.clockOffsetS,
      note: p.phase.note,
      assignments: p.assignments.map((a) => ({
        id: a.id,
        playerSteamid64: a.playerSteamid64,
        x: a.x,
        y: a.y,
        z: a.z,
        level: a.level,
        action: a.action,
        note: a.note,
      })),
      // References only. The geometry lives on the shared throw, handed over
      // separately as the library.
      utility: p.utility.map(({ use }) => ({
        id: use.id,
        throwId: use.throwId,
        throwerSteamid64: use.throwerSteamid64,
        note: use.note,
      })),
    })),
  };

  const library = (await listThrows(full.strat.map)).map(({ item, lineups, usedBy }) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    landX: item.landX,
    landY: item.landY,
    landZ: item.landZ,
    throwX: item.throwX,
    throwY: item.throwY,
    throwZ: item.throwZ,
    level: item.level,
    technique: item.technique,
    note: item.note,
    lineups: lineups.map((l) => ({ id: l.id, shotKind: l.shotKind, idx: l.idx })),
    usedBy,
  }));

  // Handed down from the server rather than read from the cookie: the token is derived
  // from the session, so the server already has it, and this works even in a context
  // where the readable cookie is missing.
  const csrf = csrfTokenFor((await sessionToken())!);

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[
          { href: `/${full.strat.map}/${full.strat.side}`, label: mapDisplayName(full.strat.map) },
          { href: `/${full.strat.map}/${full.strat.side}`, label: full.strat.side === "t" ? "T side" : "CT side" },
          { label: full.strat.name },
        ]}
      />
      <StratEditor
        stratId={id}
        map={full.strat.map}
        side={full.strat.side}
        initial={initial}
        library={library}
        roster={roster}
        csrf={csrf}
      />
    </>
  );
}
