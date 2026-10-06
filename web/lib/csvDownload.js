import { getUserTier } from "@/lib/tier";
import { toCsv } from "@/lib/csv";

// Shared plumbing for the Singularity-only CSV download routes (Player Season
// Simulations, Weekly Projection Rankings, Dynasty Draft Board, Prospect
// Rankings). Each file is built here on request instead of being embedded in
// the tool page, which used to carry a complete extra copy of its rows (twice,
// once in the HTML and once in the page data) just so a rarely-clicked button
// had something to export.

// null when the signed-in user is a Singularity member, otherwise the 403 to return.
export async function requireSingularity() {
  const { tier } = await getUserTier();
  return tier === "singularity" ? null : new Response("Singularity members only.", { status: 403 });
}

export function csvResponse({ filename, columns, rows }) {
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
