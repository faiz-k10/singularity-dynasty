import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { csvResponse } from "@/lib/csvDownload";
import { siteOrigin } from "@/lib/siteOrigin";

// /admin's "Download the list": every current newsletter subscriber as CSV, ready to import into an email tool, with each
// person's own unsubscribe link (put it in every email). Founder only (404 for anyone else).
export async function GET() {
  await requireAdmin();
  const origin = await siteOrigin();
  const rows = await fetchAllRows(createAdminClient(), "subscribers", "email, source, created_at, token", (q) => q.is("unsubscribed_at", null).order("created_at").order("id"));
  return csvResponse({
    filename: `singularity-subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
    columns: [
      { key: "email", label: "email" },
      { key: "source", label: "source" },
      { key: "created_at", label: "subscribed_at" },
      { key: "unsubscribe_url", label: "unsubscribe_url" },
    ],
    rows: rows.map((r) => ({ ...r, unsubscribe_url: `${origin}/unsubscribe?t=${r.token}` })),
  });
}
