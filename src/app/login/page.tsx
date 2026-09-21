import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_on_roster:
    "That Steam account is not on the team roster, so there is nothing here for it.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const auth = await requirePlayer();
  if (auth.ok) redirect("/");

  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? `Sign-in failed: ${error}`) : null;

  return (
    <main className="login">
      <div className="card">
        <h1>cs2 playbook</h1>
        <p className="muted">Strategies for the stack. Sign in with the Steam account you play on.</p>
        {message ? <div className="error">{message}</div> : null}
        <p>
          <a className="btn btn-primary" href="/api/auth/steam">
            Sign in through Steam
          </a>
        </p>
      </div>
    </main>
  );
}
