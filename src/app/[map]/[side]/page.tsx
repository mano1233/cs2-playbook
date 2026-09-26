import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { requirePlayer } from "@/lib/auth";
import { mapDisplayName, radarFor } from "@/lib/radar";
import {
  KINDS,
  type Side,
  createStrat,
  kindsForSide,
  listStrats,
  type StratKind,
} from "@/lib/strats";

export const dynamic = "force-dynamic";

const SIDE_LABEL: Record<Side, string> = { t: "T side", ct: "CT side" };

function isSide(v: string): v is Side {
  return v === "t" || v === "ct";
}

export default async function StratList({
  params,
}: {
  params: Promise<{ map: string; side: string }>;
}) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { map, side } = await params;
  if (!radarFor(map) || !isSide(side)) notFound();

  const rows = await listStrats(map, side);

  /**
   * A Server Action rather than a fetch to an API route: Next checks the Origin against
   * the Host for these, which is the CSRF protection this form needs. The custom
   * x-csrf-token check exists for the editor's fetch-based saves, where that check does
   * not apply.
   */
  async function create(formData: FormData) {
    "use server";
    const me = await requirePlayer();
    if (!me.ok) redirect("/login");

    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "exec") as StratKind;
    const target = String(formData.get("target") ?? "").trim();

    if (!name) return;
    if (!KINDS.some((k) => k.id === kind)) return;

    const created = await createStrat({
      map,
      side: side as Side,
      name,
      kind,
      target: target || null,
      createdBy: me.player.steamid64,
    });
    redirect(`/strat/${created.id}/edit`);
  }

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[
          { href: `/${map}/t`, label: mapDisplayName(map) },
          { label: SIDE_LABEL[side] },
        ]}
      />
      <main className="wrap">
        <div className="side-switch">
          <Link href={`/${map}/t`} className={side === "t" ? "active" : ""}>
            T side
          </Link>
          <Link href={`/${map}/ct`} className={side === "ct" ? "active" : ""}>
            CT side
          </Link>
          <Link href={`/${map}/util`}>Utility</Link>
        </div>

        <h1>
          {mapDisplayName(map)} · {SIDE_LABEL[side]}
        </h1>

        {rows.length === 0 ? (
          <p className="muted">
            Nothing here yet. The first one is the hard one.
          </p>
        ) : (
          <ul className="strat-list">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/strat/${s.id}`} className="strat-row">
                  <span className="strat-name">{s.name}</span>
                  <span className={`tag tag-${s.status}`}>{s.status}</span>
                  <span className="muted strat-meta">
                    {s.kind.replace("_", "-")}
                    {s.target ? ` · ${s.target.toUpperCase()}` : ""} · {s.phaseCount} phase
                    {Number(s.phaseCount) === 1 ? "" : "s"} · {s.utilityCount} util
                  </span>
                  <span className="muted strat-author">{s.author ?? "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <section className="card new-strat">
          <h2>New strat</h2>
          <form action={create} className="new-strat-form">
            <label>
              <span>Name</span>
              <input name="name" required placeholder="Default A exec" autoComplete="off" />
            </label>
            <label>
              <span>Kind</span>
              <select name="kind" defaultValue={kindsForSide(side)[0]?.id}>
                {kindsForSide(side).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Target</span>
              <input name="target" placeholder="A / B / mid" autoComplete="off" />
            </label>
            <button className="btn btn-primary" type="submit">
              Create and open
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
