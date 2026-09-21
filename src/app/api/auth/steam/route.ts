import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { buildAuthUrl } from "@/lib/steam";

export const dynamic = "force-dynamic";

export async function GET() {
  redirect(buildAuthUrl(env.publicBaseUrl()));
}
