import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "WR/QB Prospect Rankings — Singularity Dynasty",
};

const TEASER_LIMIT_PER_POSITION = 5;
// Singularity-only per the pricing copy.
const PAID_TIERS = ["singularity"];

async function fetchPosition(supabase, draftClass, position, hasFullAccess) {
  let query = supabase
    .from("prospect_rankings")
    .select("rank, player_name, position, school, comp, notes", {
      count: "exact",
    })
    .eq("draft_class", draftClass)
    .eq("position", position)
    .order("rank", { ascending: true });

  if (!hasFullAccess) {
    query = query.limit(TEASER_LIMIT_PER_POSITION);
  }

  const { data, count } = await query;
  return { rows: data || [], total: count || 0 };
}

export default async function ProspectRankingsPage() {
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("prospect_rankings")
    .select("draft_class")
    .order("draft_class", { ascending: false })
    .limit(1)
    .maybeSingle();

  let wrs = { rows: [], total: 0 };
  let qbs = { rows: [], total: 0 };

  if (latest) {
    [wrs, qbs] = await Promise.all([
      fetchPosition(supabase, latest.draft_class, "WR", hasFullAccess),
      fetchPosition(supabase, latest.draft_class, "QB", hasFullAccess),
    ]);
  }

  const totalRows = wrs.rows.length + qbs.rows.length;
  const totalCount = wrs.total + qbs.total;
  const isTeaser = !hasFullAccess && totalCount > totalRows;

  const renderGroup = (label, rows) =>
    rows.length > 0 && (
      <div className="draft-round" key={label}>
        <div className="draft-round-title">{label}</div>
        <div className="rankings-table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>School</th>
                <th>Comp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.position}-${row.rank}`}>
                  <td className="mono">{row.rank}</td>
                  <td>{row.player_name}</td>
                  <td className="mono">{row.school || "—"}</td>
                  <td className="tool-notes">{row.comp || row.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.draft_class} Draft Class` : "Prospects"}
        </div>
        <h1>WR/QB Prospect Rankings &amp; Comparisons</h1>
        <p className="tool-sub">
          Incoming rookie rankings for wide receivers and quarterbacks, with
          statistical comps against past prospects using athletic and
          production percentiles.
        </p>

        {totalRows === 0 ? (
          <div className="tool-empty">
            <p>Prospect boards publish ahead of the draft — check back soon.</p>
          </div>
        ) : (
          <>
            {renderGroup("Wide Receivers", wrs.rows)}
            {renderGroup("Quarterbacks", qbs.rows)}

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top {TEASER_LIMIT_PER_POSITION} at
                  each position ({totalRows} of {totalCount} prospects).
                  Unlock the full boards with Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}
