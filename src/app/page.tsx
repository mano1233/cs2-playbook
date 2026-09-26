import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  return (
    <>
      <header className="topbar">
        <div className="inner">
          <div className="brand">
            cs2 <span>playbook</span>
          </div>
          <div className="spacer" />
          <div className="who">
            <span>signed in as</span>{" "}
            <strong>{auth.player.nickname}</strong>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="wrap">
        <h1>Playbook</h1>
        <p className="muted">
          Maps, strats and lineups land here next. Authentication is wired up.
        </p>
      </main>
    </>
  );
}
