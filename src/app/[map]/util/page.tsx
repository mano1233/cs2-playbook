/**
 * The utility explorer for one map.
 *
 * One radar with every landing spot on it, in the shape csnades.gg made familiar:
 * pick where you want a grenade to land, see every way the team knows to get it there,
 * pick one and get the pictures, the steps and a setpos to practise from. The data was
 * already this shape — a throw is a landing spot, its lineups are the origins — so this
 * page is a different way of looking at the same library, not a new model.
 *
 * The page is server-rendered with the whole map's library; a map has dozens of throws,
 * not thousands, and having all of it in hand is what makes filtering instant.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { UtilExplorer, type ExplorerThrow } from "@/components/UtilExplorer";
import { requirePlayer, sessionToken } from "@/lib/auth";
import { calloutLabels } from "@/lib/callouts";
import { mapDisplayName, radarFor } from "@/lib/radar";
import { csrfTokenFor } from "@/lib/session";
import { listThrows, serialiseThrow, throwUses } from "@/lib/throws";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function UtilLibrary({
  params,
  searchParams,
}: {
  params: Promise<{ map: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { map } = await params;
  const cfg = radarFor(map);
  if (!cfg) notFound();

  const [rows, uses, sp] = await Promise.all([listThrows(map), throwUses(map), searchParams]);
  const throws: ExplorerThrow[] = rows.map((r) => ({
    ...serialiseThrow(r),
    uses: uses[r.item.id] ?? [],
  }));

  // Only a signed-in browser reaches this page, so there is always a session token.
  const token = await sessionToken();
  const csrf = token ? csrfTokenFor(token) : "";

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[{ href: `/${map}/t`, label: mapDisplayName(map) }, { label: "Utility" }]}
      />
      <main className="ux-wrap">
        <div className="ux-top">
          <div className="side-switch">
            <Link href={`/${map}/t`}>T side</Link>
            <Link href={`/${map}/ct`}>CT side</Link>
            <Link href={`/${map}/util`} className="active">Utility</Link>
          </div>
          <div className="spacer" />
          <Link className="btn" href={`/${map}/util/import`}>Import screenshots</Link>
        </div>

        <UtilExplorer
          map={map}
          levels={cfg.levels.map((l) => l.id)}
          callouts={calloutLabels(map)}
          throws={throws}
          csrf={csrf}
          initial={{
            throwId: one(sp.throw),
            lineupId: one(sp.lineup),
            kind: one(sp.kind),
            side: one(sp.side),
            level: one(sp.level),
          }}
        />
      </main>
    </>
  );
}
