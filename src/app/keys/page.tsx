import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ApiKeys } from "@/components/ApiKeys";
import { requirePlayer, sessionToken } from "@/lib/auth";
import { csrfTokenFor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const csrf = csrfTokenFor((await sessionToken())!);

  return (
    <>
      <TopBar nickname={auth.player.nickname} crumbs={[{ label: "API keys" }]} />
      <main className="wrap">
        <h1>API keys</h1>
        <p className="muted">
          A key lets a script do what you can do signed in — add throws, upload lineups,
          import a folder. It carries no scopes and no expiry: it is as powerful as your
          account until you revoke it.
        </p>

        <ApiKeys csrf={csrf} />

        <section className="card" style={{ marginTop: "1.5rem" }}>
          <h2>Using it</h2>
          <pre className="usage">{`curl https://playbook.meerkat-cirius.ts.net/api/throws?map=de_nuke   -H "Authorization: Bearer pbk_..."

# a complete util: kind, where it lands, where it is thrown from
curl -X POST https://playbook.meerkat-cirius.ts.net/api/throws   -H "Authorization: Bearer pbk_..."   -H "content-type: application/json"   -d '{"map":"de_nuke","kind":"smoke","name":"heaven",
       "landX":500,"landY":-900,
       "lineup":{"getpos":"setpos -1300 -400 -350;setang -7.1 -47.2 0",
                 "fromCallout":"T Roof","side":"t","click":"left","jump":true,
                 "movement":"stationary","precision":"precise",
                 "steps":"Stand in the corner of the pipe\nAim at the antenna"}}'

# then its screenshots, against the lineup id the call above returned
for k in stand crosshair result; do
  curl -X POST https://playbook.meerkat-cirius.ts.net/api/lineups/$LINEUP/shots     -H "Authorization: Bearer pbk_..."     -F shotKind=$k -F file=@heaven-$k.png
done

# a whole folder at once
curl -X POST https://playbook.meerkat-cirius.ts.net/api/throws/import   -H "Authorization: Bearer pbk_..."   -F map=de_inferno -F plan='[{"file":"B CHURCH THROW.png","name":"B Church","kind":"smoke","shotKind":"crosshair"}]'   -F 'file=@B CHURCH THROW.png'`}</pre>
          <p className="hint">
            Both positions are write-once, so send them at creation — afterwards the
            server refuses to move either with a 409. <code>shotKind</code> is{" "}
            <code>stand</code> (where you stand), <code>crosshair</code> (what you aim
            at) or <code>result</code>, which is optional.
          </p>
          <p className="hint">
            <code>getpos</code> is the line CS2 prints for the <code>getpos</code> console
            command — exact position and view angles. <code>throwX</code>/<code>throwY</code>{" "}
            still work for a spot without angles.
          </p>
          <p className="hint">
            No CSRF header is needed with a bearer token. That check exists because a
            browser attaches cookies by itself; nothing attaches a bearer token for you,
            so there is no cross-site request to forge.
          </p>
        </section>
      </main>
    </>
  );
}
