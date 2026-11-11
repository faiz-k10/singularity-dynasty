import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { tokenMatches } from "@/lib/revalidateToken";

// Called by the weekly publish job right after new rankings / simulations / game logs are published (scripts/weekly-run.mjs), so the
// site shows the new week at once even though its data caches now last an hour (Nov 10 2026 scaling pass: refilling every minute pulled
// ~100GB a month out of the database). Every cached model-data read is tagged "model-data". The next visitor gets the previous copy once
// while the new one loads; everyone after sees the new week.
export async function POST(request) {
  if (!tokenMatches(request.headers.get("x-revalidate-token"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  revalidateTag("model-data", "max");
  return NextResponse.json({ ok: true });
}
