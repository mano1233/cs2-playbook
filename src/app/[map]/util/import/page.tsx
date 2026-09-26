import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ImportShots } from "@/components/ImportShots";
import { requirePlayer, sessionToken } from "@/lib/auth";
import { mapDisplayName, radarFor } from "@/lib/radar";
import { csrfTokenFor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ map: string }> }) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { map } = await params;
  if (!radarFor(map)) notFound();

  const csrf = csrfTokenFor((await sessionToken())!);

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[
          { href: `/${map}/t`, label: mapDisplayName(map) },
          { href: `/${map}/util`, label: "Utility" },
          { label: "Import" },
        ]}
      />
      <main className="wrap">
        <h1>Import screenshots · {mapDisplayName(map)}</h1>
        <p className="muted">
          A folder of CS2 screenshots becomes throws. The filenames already say which
          pictures belong together and what each one shows, so the grouping is read from
          them rather than asked for.{" "}
          <Link href={`/${map}/util`}>Back to the library</Link>
        </p>
        <ImportShots map={map} csrf={csrf} />
      </main>
    </>
  );
}
